import 'dotenv/config'
import { mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

import sharp from 'sharp'

import { getPayload, type Payload } from 'payload'

import config from '../payload.config'

/**
 * One-time, idempotent importer for the magazine's back-issues that survive only as a
 * cover image. Reads the git-ignored `magazines/covers/lalla-fatema-<N>.jpg` and creates
 * one PUBLISHED, cover-only `magazine-issues` doc per N, with no PDF. On the site such an
 * issue appears in the `/magazine` archive (behind "load more") as a cover that opens
 * nothing.
 *
 * - Skips every N that is already an issue, in any status. The newest issues arrived
 *   with their PDF through `import-magazines.ts` and are never touched, and a re-run
 *   creates nothing.
 * - Normalises each cover the way the existing ones were made: EXIF auto-orient, sRGB,
 *   at most 900 px wide, JPEG q82. The conversion matters: most source files are CMYK,
 *   which browsers draw with wrong or inverted colours, and a few are 3–7 MB originals.
 * - Creates newest-first (N descending), so an interrupted run still leaves the archive
 *   contiguous below the issues already online.
 * - If the issue create fails, it deletes the cover it just uploaded, so a re-run does
 *   not orphan media.
 *
 * Usage:
 *   pnpm seed:magazine-covers --dry-run [--out <dir>]
 *       Read-only. Prints the plan and converts every planned cover in memory (or into
 *       <dir> for inspection by eye). Writes nothing to the database or to Blob storage.
 *   pnpm seed:magazine-covers
 *       Real import. NOTE: dev and production share one database, so this is live.
 */

const COVERS_DIR = join(process.cwd(), 'magazines', 'covers')
const COVER_WIDTH = 900
const FILE_RE = /^lalla-fatema-([1-9]\d*)\.jpe?g$/i

type CoverFile = { issueNumber: number; file: string }

/** Every cover file, newest issue first. Refuses anything it does not understand. */
function listCoverFiles(): CoverFile[] {
  const files: CoverFile[] = []
  const unexpected: string[] = []
  for (const file of readdirSync(COVERS_DIR)) {
    if (file.startsWith('.')) continue // .DS_Store and friends
    const m = FILE_RE.exec(file)
    if (m) files.push({ issueNumber: Number(m[1]), file })
    else unexpected.push(file)
  }
  if (unexpected.length) {
    throw new Error(`Unexpected files in ${COVERS_DIR}: ${unexpected.join(', ')}`)
  }
  const seen = new Map<number, string>()
  for (const f of files) {
    const other = seen.get(f.issueNumber)
    if (other) throw new Error(`Two covers for issue ${f.issueNumber}: ${other}, ${f.file}`)
    seen.set(f.issueNumber, f.file)
  }
  return files.sort((a, b) => b.issueNumber - a.issueNumber)
}

/** Auto-orient, convert to sRGB, cap the width, recompress. */
async function convertCover(path: string): Promise<Buffer> {
  return sharp(path)
    .rotate()
    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
    .toColourspace('srgb')
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
}

/** Issue numbers already in the collection, whatever their status. */
async function existingIssueNumbers(payload: Payload): Promise<Set<number>> {
  const { docs } = await payload.find({
    collection: 'magazine-issues',
    pagination: false,
    depth: 0,
    select: { issueNumber: true },
  })
  return new Set(docs.map((d) => d.issueNumber))
}

async function dryRun(todo: CoverFile[], outDir: string | null) {
  if (outDir) mkdirSync(outDir, { recursive: true })
  let bytes = 0
  for (const { issueNumber, file } of todo) {
    const data = await convertCover(join(COVERS_DIR, file))
    const meta = await sharp(data).metadata()
    bytes += data.length
    if (meta.space !== 'srgb' || (meta.width ?? 0) > COVER_WIDTH) {
      throw new Error(`issue ${issueNumber}: conversion produced ${meta.space} ${meta.width}px`)
    }
    if (outDir) writeFileSync(join(outDir, `lalla-fatema-cover-${issueNumber}.jpg`), data)
    console.log(
      `would create  issue ${issueNumber}  ${file} → ${meta.width}x${meta.height} ${meta.space} ${Math.round(data.length / 1024)} KB`,
    )
  }
  console.log(`\nconverted ${todo.length} covers in memory, ${Math.round(bytes / 1024)} KB in all`)
  console.log('dry-run: nothing was written to the database or to storage')
}

async function importCovers(payload: Payload, todo: CoverFile[]) {
  let created = 0
  let failed = 0
  for (const { issueNumber, file } of todo) {
    let coverId: number | null = null
    try {
      const data = await convertCover(join(COVERS_DIR, file))
      const cover = await payload.create({
        collection: 'media',
        data: { alt: `غلاف العدد ${issueNumber} من مجلة لالة فاطمة` },
        file: {
          data,
          mimetype: 'image/jpeg',
          name: `lalla-fatema-cover-${issueNumber}.jpg`,
          size: data.length,
        },
      })
      coverId = cover.id
      await payload.create({
        collection: 'magazine-issues',
        data: {
          issueNumber,
          title: `العدد ${issueNumber}`,
          cover: cover.id,
          _status: 'published',
        },
      })
      created += 1
      console.log(`created  issue ${issueNumber}  (cover media ${cover.id})`)
    } catch (err) {
      failed += 1
      console.error(`failed   issue ${issueNumber}  ${file}`, err)
      if (coverId !== null) {
        try {
          await payload.delete({ collection: 'media', id: coverId })
        } catch (cleanupErr) {
          console.error(`  cleanup failed: orphaned cover media ${coverId}`, cleanupErr)
        }
      }
    }
  }
  console.log(`\ncreated ${created} / failed ${failed} / planned ${todo.length}`)
  if (failed) process.exitCode = 1
}

async function main() {
  const argv = process.argv.slice(2)
  const isDryRun = argv.includes('--dry-run')
  const outIdx = argv.indexOf('--out')
  const outDir = outIdx >= 0 && argv[outIdx + 1] ? resolve(argv[outIdx + 1]) : null
  if (outDir && !isDryRun) throw new Error('--out is only valid with --dry-run')

  const files = listCoverFiles()
  const payload = await getPayload({ config: await config })
  const existing = await existingIssueNumbers(payload)
  const todo = files.filter((f) => !existing.has(f.issueNumber))
  const skipped = files.length - todo.length

  console.log(
    `plan: create ${todo.length}, skip ${skipped} (already issues), files ${files.length}` +
      (todo.length ? `, numbers ${todo.at(-1)!.issueNumber}..${todo[0].issueNumber}` : ''),
  )

  if (isDryRun) await dryRun(todo, outDir)
  else await importCovers(payload, todo)
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
