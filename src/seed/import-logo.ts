import 'dotenv/config'
import { existsSync } from 'fs'
import { join } from 'path'

import sharp from 'sharp'

import { getPayload } from 'payload'

import config from '../payload.config'

/**
 * Idempotent importer for the site logo: takes a source PNG from the repo root,
 * lifts it off its white background, trims, downscales, uploads it to `media`, and
 * points Site Settings → الهوية → الشعار (صورة) at it. The Header renders that field.
 *
 * Why the white-keying step: the supplied artwork is flat 2-tone lettering flattened
 * onto an opaque white canvas. Keying keeps the logo surface-independent — it renders
 * cleanly on any `--color-surface`, not just white. See `keyOutWhite` below.
 *
 * Why resize rather than upload the original: `media` deliberately keeps originals
 * only (no Sharp variants — see `src/collections/Media.ts`), and the custom
 * next/image loader passes URLs straight through when `NEXT_PUBLIC_IMAGE_HOST` is
 * unset. The header is sticky on every route, so the raw file's weight would land on
 * every page load.
 *
 * Safe to re-run: the media doc is keyed by filename. Identical bytes → no-op.
 * Different bytes (i.e. a new source logo) → the old doc(s) are deleted and one fresh
 * doc is created under the canonical name.
 *
 * Deliberately NOT `payload.update(..., { file })`: replacing a file in place makes
 * Payload rename the doc to avoid colliding with the old stored object (observed:
 * `logo-lalla-fatema.png` → `logo-lalla-fatema-1.png`). The canonical name would then
 * be free, so the next run would no longer match and would create a duplicate. The
 * delete-then-create path below also sweeps up any `-N` strays a previous in-place
 * update left behind, so a messy library converges back to exactly one logo row.
 *
 * Usage:
 *   pnpm seed:logo                  # process DEFAULT_SOURCE and publish
 *   pnpm seed:logo path/to/new.png  # swap in a different source
 *   pnpm seed:logo --dry-run        # report only; connects to nothing, writes nothing
 */

const DEFAULT_SOURCE = 'logo-lalla-fatema.png'
const TARGET_NAME = 'logo-lalla-fatema.png'
const TARGET_WIDTH = 700
const ALT = 'مجلة لالة فاطمة — مجلة المرأة والعائلة المغربية'

// "Distance from white" thresholds. The source's white is not pure — it carries a
// couple of levels of generator noise — so anything under NOISE is background, and
// anything at/above FULL is solid ink. Between them lies antialiasing, which keeps
// fractional alpha so the letterforms stay smooth.
const NOISE = 14
const FULL = 60

/**
 * Rebuilds an alpha channel for artwork composited onto white, then unpremultiplies
 * the colour so antialiased edges don't retain a white halo against a dark surface.
 */
async function keyOutWhite(src: string): Promise<Buffer> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const out = Buffer.alloc(width * height * 4) // zero-filled → transparent by default

  for (let i = 0; i < width * height; i++) {
    const o = i * channels
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    const distance = 255 - Math.min(r, g, b)
    const alpha = Math.max(0, Math.min(1, (distance - NOISE) / (FULL - NOISE)))
    if (alpha <= 0) continue

    const q = i * 4
    const unpremultiply = (v: number) =>
      Math.max(0, Math.min(255, Math.round((v - 255 * (1 - alpha)) / alpha)))
    out[q] = unpremultiply(r)
    out[q + 1] = unpremultiply(g)
    out[q + 2] = unpremultiply(b)
    out[q + 3] = Math.round(alpha * 255)
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

/**
 * True when the source already carries real transparency, in which case keying must
 * be skipped: transparent pixels serialize as rgb(0,0,0), which reads as maximum
 * "distance from white" and would repaint the whole background solid black.
 */
async function hasTransparency(src: string): Promise<boolean> {
  const { channels } = await sharp(src).metadata()
  if (!channels || channels < 4) return false
  // `opaque` is false only when at least one pixel is non-opaque.
  const { isOpaque } = await sharp(src).stats()
  return !isOpaque
}

/** Keyed (if needed) → trimmed to the artwork bounds → downscaled → indexed PNG. */
async function buildLogo(src: string): Promise<{ data: Buffer; width: number; height: number }> {
  const alreadyTransparent = await hasTransparency(src)
  if (alreadyTransparent) console.log('note    source already has an alpha channel — skipping white-key')
  const keyed = alreadyTransparent ? await sharp(src).png().toBuffer() : await keyOutWhite(src)
  const { data, info } = await sharp(keyed)
    .trim()
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    // Flat 2-tone art, so an indexed palette is effectively lossless here and cuts
    // the file several-fold versus truecolour.
    .png({ compressionLevel: 9, palette: true })
    .toBuffer({ resolveWithObject: true })

  return { data, width: info.width, height: info.height }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const sourceName = args.find((a) => !a.startsWith('--')) ?? DEFAULT_SOURCE
  const source = join(process.cwd(), sourceName)

  if (!existsSync(source)) throw new Error(`source logo not found: ${source}`)

  const logo = await buildLogo(source)
  console.log(
    `built   ${TARGET_NAME}  ${logo.width}×${logo.height}  ${(logo.data.length / 1024).toFixed(1)}KB  (from ${sourceName})`,
  )

  if (dryRun) {
    console.log('dry-run — no Payload connection made, nothing uploaded or written')
    return
  }

  const payload = await getPayload({ config: await config })
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })

  // Canonical name plus any `-N` strays from an earlier in-place update.
  const stem = TARGET_NAME.replace(/\.png$/, '')
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { like: `${stem}%` } },
    limit: 100,
  })
  const canonical = existing.docs.find((d) => d.filename === TARGET_NAME)
  const strays = existing.docs.filter((d) => d.id !== canonical?.id)

  // Nothing to do when the canonical doc already holds these exact bytes and is the
  // only logo row — but still fall through if strays need sweeping.
  if (canonical && canonical.filesize === logo.data.length && strays.length === 0) {
    if (settings.logo !== canonical.id) {
      await payload.updateGlobal({ slug: 'site-settings', data: { logo: canonical.id } })
      console.log(`wired   site-settings.logo → media #${canonical.id}`)
    }
    console.log(`reuse   media #${canonical.id}  (identical bytes, nothing to upload)`)
    return
  }

  // Drop the FK first so the media rows can be deleted, then rebuild from scratch.
  if (settings.logo) {
    await payload.updateGlobal({ slug: 'site-settings', data: { logo: null } })
  }
  for (const doc of existing.docs) {
    await payload.delete({ collection: 'media', id: doc.id })
    console.log(`delete  media #${doc.id}  ${doc.filename}`)
  }

  const created = await payload.create({
    collection: 'media',
    data: { alt: ALT },
    file: { data: logo.data, mimetype: 'image/png', name: TARGET_NAME, size: logo.data.length },
  })
  console.log(`upload  media #${created.id}  ${created.filename} → ${created.url}`)

  await payload.updateGlobal({ slug: 'site-settings', data: { logo: created.id } })
  console.log(`wired   site-settings.logo → media #${created.id}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
