import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'

import { pdf as renderPdfPages } from 'pdf-to-img'
import sharp from 'sharp'

import { getPayload } from 'payload'

import config from '../payload.config'

/**
 * One-time, idempotent importer: loads the 20 real magazine issues from the
 * git-ignored `magazines/` folder (20 PDFs + `index.json`) into the
 * `magazine-issues` collection. For each issue it rasterizes a cover from the
 * PDF's page 1, uploads cover + PDF to `media`, and upserts the issue.
 *
 * Safe to re-run: issues that already have both `cover` and `pdf` are skipped
 * (no re-upload, no duplicate). Never touches issue #999 (the demo/seed issue
 * from `src/seed/magazine.ts`) since that issueNumber never appears in
 * `magazines/index.json`.
 *
 * Usage:
 *   pnpm seed:magazines            # real import (writes to DB + Blob storage)
 *   pnpm seed:magazines --dry-run  # prints the plan only, touches nothing
 */

const MAGAZINES_DIR = join(process.cwd(), 'magazines')
const COVER_WIDTH = 900

type MagazineIndexEntry = {
  n: string
  file: string
  sizeMB: number
}

function loadEntries(): MagazineIndexEntry[] {
  // `index.json` is UTF-8-with-BOM (PowerShell-authored) — strip it before parsing.
  // (Using a charCode check rather than a regex literal avoids embedding an
  // invisible U+FEFF character in the source.)
  let raw = readFileSync(join(MAGAZINES_DIR, 'index.json'), 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  return JSON.parse(raw) as MagazineIndexEntry[]
}

/** `n="01"` → issue 167 … `n="20"` → issue 148 (verified mapping, see task brief). */
function issueNumberFor(entry: MagazineIndexEntry): number {
  return 168 - Number(entry.n)
}

/**
 * Renders page 1 of a magazine PDF to a ~900px-wide portrait JPEG cover.
 *
 * 1. Try `sharp` first (zero new deps) — if the libvips build sharp ships were
 *    compiled with PDF input support, no extra dependency is needed at all.
 *    Confirmed on this platform it is NOT: sharp 0.34.2's prebuilt win32 binary
 *    reports `sharp.format.pdf.input` as `{ file: false, buffer: false, stream:
 *    false }` and throws "Input buffer contains unsupported image format" for
 *    every real PDF. That failure is expected here, so this branch falls
 *    through — it's kept live (rather than deleted) in case a different sharp
 *    build (e.g. a future version, or a non-Windows platform) does support PDF
 *    input, in which case this skips pdf-to-img entirely.
 * 2. Fall back to `pdf-to-img` (pdfjs-dist + a prebuilt @napi-rs/canvas binary —
 *    no system binaries / native build tools required) to rasterize page 1 to
 *    a PNG buffer, then resize + recompress to JPEG with sharp (which decodes
 *    PNG natively — only PDF *input* is unsupported).
 *
 * Proven against a real 20th-issue PDF (100 pages, 27.9 MB): pdf-to-img
 * rendered page 1 to a 1312×1631 PNG in ~1.1s; resized/recompressed to a
 * 900×1119 JPEG (~265 KB) — a legible, correct cover.
 */
async function renderCover(pdfPath: string): Promise<{ data: Buffer; name: string; mimetype: string }> {
  let sharpError: unknown
  try {
    const pdfBuffer = readFileSync(pdfPath)
    const data = await sharp(pdfBuffer, { page: 0, density: 150 })
      .resize({ width: COVER_WIDTH })
      .jpeg({ quality: 82 })
      .toBuffer()
    return { data, name: 'cover.jpg', mimetype: 'image/jpeg' }
  } catch (err) {
    sharpError = err
  }

  try {
    const doc = await renderPdfPages(pdfPath, { scale: 2 })
    try {
      const page1Png = await doc.getPage(1)
      const data = await sharp(page1Png).resize({ width: COVER_WIDTH }).jpeg({ quality: 82 }).toBuffer()
      return { data, name: 'cover.jpg', mimetype: 'image/jpeg' }
    } finally {
      await doc.destroy()
    }
  } catch (pdfToImgError) {
    const sharpMsg = sharpError instanceof Error ? sharpError.message : String(sharpError)
    const pdfToImgMsg = pdfToImgError instanceof Error ? pdfToImgError.message : String(pdfToImgError)
    throw new Error(
      `Cover rasterization failed for ${pdfPath}\n  sharp: ${sharpMsg}\n  pdf-to-img: ${pdfToImgMsg}`,
    )
  }
}

function printDryRunPlan(entries: MagazineIndexEntry[]) {
  for (const entry of entries) {
    const issueNumber = issueNumberFor(entry)
    console.log(`${entry.n} → issue ${issueNumber}  ${entry.file}  ${entry.sizeMB}MB`)
  }
  console.log(`\ntotal ${entries.length} (dry-run — no Payload connection made, nothing uploaded or written)`)
}

async function importMagazines(entries: MagazineIndexEntry[]) {
  const payload = await getPayload({ config: await config })

  let imported = 0
  let skipped = 0
  let failed = 0

  for (const entry of entries) {
    const issueNumber = issueNumberFor(entry)

    // Track media created *in this iteration* so a later failure (e.g. the
    // magazine-issues create/update) can be rolled back — otherwise a re-run
    // would re-upload a fresh cover + PDF and permanently orphan these.
    let coverId: number | null = null
    let pdfId: number | null = null

    try {
      const title = `العدد ${issueNumber}`
      const pdfPath = join(MAGAZINES_DIR, entry.file)

      const existing = await payload.find({
        collection: 'magazine-issues',
        where: { issueNumber: { equals: issueNumber } },
        limit: 1,
      })
      const existingDoc = existing.docs[0]

      if (existingDoc?.cover && existingDoc?.pdf) {
        console.log(`skip    issue ${issueNumber}  ${entry.file}  (already has cover + pdf)`)
        skipped += 1
        continue
      }

      console.log(`import  issue ${issueNumber}  ${entry.file}  rendering cover…`)
      const coverFile = await renderCover(pdfPath)
      const cover = await payload.create({
        collection: 'media',
        data: { alt: `غلاف العدد ${issueNumber}` },
        file: {
          data: coverFile.data,
          mimetype: coverFile.mimetype,
          name: coverFile.name,
          size: coverFile.data.length,
        },
      })
      coverId = cover.id

      const pdfMedia = await payload.create({
        collection: 'media',
        data: { alt: `مجلة لالة فاطمة — العدد ${issueNumber}` },
        filePath: pdfPath,
      })
      pdfId = pdfMedia.id

      if (existingDoc) {
        await payload.update({
          collection: 'magazine-issues',
          id: existingDoc.id,
          data: { cover: cover.id, pdf: pdfMedia.id, title, _status: 'published' },
        })
      } else {
        await payload.create({
          collection: 'magazine-issues',
          data: {
            issueNumber,
            title,
            cover: cover.id,
            pdf: pdfMedia.id,
            _status: 'published',
          },
        })
      }

      console.log(`done    issue ${issueNumber}`)
      imported += 1
    } catch (err) {
      console.error(`failed  issue ${issueNumber}  ${entry.file}`, err)

      if (coverId !== null) {
        try {
          await payload.delete({ collection: 'media', id: coverId })
        } catch (cleanupErr) {
          console.error(`  cleanup failed: could not delete orphaned cover media ${coverId}`, cleanupErr)
        }
      }
      if (pdfId !== null) {
        try {
          await payload.delete({ collection: 'media', id: pdfId })
        } catch (cleanupErr) {
          console.error(`  cleanup failed: could not delete orphaned pdf media ${pdfId}`, cleanupErr)
        }
      }

      failed += 1
      continue
    }
  }

  console.log(`\nimported ${imported} / skipped ${skipped} / failed ${failed} / total ${entries.length}`)
}

async function main() {
  const entries = loadEntries()

  if (process.argv.includes('--dry-run')) {
    printDryRunPlan(entries)
    return
  }

  await importMagazines(entries)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
