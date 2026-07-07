import 'dotenv/config'

import { reindexAllPosts, searchEnabled } from '../lib/search'

/**
 * One-off Meilisearch backfill. Safe to run anytime: if search is disabled (no
 * credentials) it logs and exits 0 without doing anything. When credentials are
 * present it (re)configures the index and indexes every published post.
 *
 * Run: npx pnpm@10.18.0 exec tsx src/seed/reindex.ts
 */
async function run() {
  if (!searchEnabled()) {
    console.log('Search disabled — set MEILISEARCH_HOST + MEILISEARCH_API_KEY to enable, then rerun.')
    process.exit(0)
  }
  const { indexed } = await reindexAllPosts()
  console.log(`Reindexed ${indexed} published post(s) into Meilisearch.`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
