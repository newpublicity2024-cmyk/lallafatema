/**
 * One-off cleanup: remove orphaned media left by the first (pre-race-fix) parallel
 * WP import attempt. Targets media created during that run whose filenames still use
 * Payload's auto-suffix pattern (no `-<wpId>-(hero|inline)` SEO tail) and that NO post
 * references as featuredImage / og image. Deletes via Payload so the underlying Vercel
 * Blob object is removed too (a raw SQL DELETE would strand the file).
 *
 * Safety: --dry lists candidates without deleting. Only media with id > MIN_ID and the
 * legacy filename shape are considered; each is re-checked for references before delete.
 *
 * Usage: tsx src/seed/cleanup-orphan-media.ts [--dry]
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

// First media id created in this migration session (pre-session max was 851).
const MIN_ID = 851
// SEO-named files from the good run look like "...-<wpId>-hero.jpg" / "...-<wpId>-inline-01.jpg".
const SEO_TAIL = /-\d+-(hero|inline)/

async function main() {
  const dry = process.argv.includes('--dry')
  const payload = await getPayload({ config: await config })

  let page = 1
  const candidates: { id: number | string; filename: string }[] = []
  // Walk all media above the cutoff; collect legacy-named ones.
  for (;;) {
    const { docs, hasNextPage } = await payload.find({
      collection: 'media',
      where: { id: { greater_than: MIN_ID } },
      limit: 200,
      page,
      depth: 0,
      sort: 'id',
    })
    for (const m of docs) {
      const fn = (m as { filename?: string }).filename ?? ''
      if (!SEO_TAIL.test(fn)) candidates.push({ id: m.id, filename: fn })
    }
    if (!hasNextPage) break
    page++
  }

  const stats = { candidates: candidates.length, deleted: 0, keptReferenced: 0, failed: 0 }

  for (const c of candidates) {
    // Re-check nothing references it as featured or og image.
    const [feat, og] = await Promise.all([
      payload.find({ collection: 'posts', where: { featuredImage: { equals: c.id } }, limit: 1, depth: 0 }),
      payload.find({ collection: 'posts', where: { 'seo.ogImage': { equals: c.id } }, limit: 1, depth: 0 }),
    ])
    if (feat.docs[0] || og.docs[0]) {
      stats.keptReferenced++
      continue
    }
    if (dry) {
      stats.deleted++ // would-delete
      continue
    }
    try {
      await payload.delete({ collection: 'media', id: c.id })
      stats.deleted++
    } catch (e) {
      stats.failed++
      console.warn(`  ⚠ delete failed (media ${c.id} ${c.filename}): ${(e as Error).message}`)
    }
  }

  console.log(`${dry ? '[dry] ' : ''}orphan-media cleanup:`, JSON.stringify(stats, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
