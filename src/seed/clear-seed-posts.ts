/**
 * Delete seed/demo Posts — every post WITHOUT a `legacyWpId` (i.e. not created by the
 * WordPress migration). Uses the Payload Local API so version rows, relationships, and
 * afterDelete hooks (revalidation / search) are handled cleanly, unlike a raw SQL DELETE.
 *
 * Usage:  tsx src/seed/clear-seed-posts.ts [--dry]
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

async function main() {
  const dry = process.argv.includes('--dry')
  const payload = await getPayload({ config: await config })

  const { docs } = await payload.find({
    collection: 'posts',
    where: { legacyWpId: { exists: false } },
    limit: 1000,
    depth: 0,
  })
  console.log(`seed posts (no legacyWpId): ${docs.length}`)
  console.log(docs.map((d) => `  ${d.id}  ${(d as { title?: string }).title ?? '(untitled)'}`).join('\n'))

  if (dry) {
    console.log('[dry] no deletions performed')
    process.exit(0)
  }

  const res = await payload.delete({ collection: 'posts', where: { legacyWpId: { exists: false } } })
  const deleted = Array.isArray((res as { docs?: unknown[] }).docs) ? (res as { docs: unknown[] }).docs.length : docs.length
  console.log(`✓ deleted ${deleted} seed posts`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
