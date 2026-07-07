import { Meilisearch, type Index } from 'meilisearch'

import type { Post } from '@/payload-types'
import { getPayloadClient } from './payload'

export const POSTS_INDEX = 'posts'

export type SearchDoc = {
  id: number
  title: string
  excerpt?: string
  categoryName?: string
  authorNames?: string
  slug?: string
  publishedAt?: string
}

/** Search is enabled only when BOTH Meilisearch credentials are present. */
export function searchEnabled(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)
}

// Lazily-created client — importing this module never connects. The client is
// instantiated the first time an enabled code path needs it.
let client: Meilisearch | null = null

function getIndex(): Index | null {
  // Re-check searchEnabled() on every call (not just relying on `client` being
  // null) so env changes — e.g. in tests — are always respected.
  if (!searchEnabled()) return null
  if (!client) {
    client = new Meilisearch({
      host: process.env.MEILISEARCH_HOST as string,
      apiKey: process.env.MEILISEARCH_API_KEY as string,
    })
  }
  return client.index(POSTS_INDEX)
}

/** Map a depth:1 Post → the lightweight searchable document. */
function toDoc(post: Post): SearchDoc {
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const authorNames = (post.authors ?? [])
    .map((a) => (a && typeof a === 'object' ? a.name : null))
    .filter((n): n is string => Boolean(n))
    .join(' ')
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt ?? undefined,
    categoryName: category?.name ?? undefined,
    authorNames: authorNames || undefined,
    slug: post.slug ?? undefined,
    publishedAt: post.publishedAt ?? undefined,
  }
}

/**
 * Post ids matching `query`, in Meilisearch relevance order.
 * Returns [] when disabled, when the query is blank, or on any Meilisearch error
 * (a search outage degrades to "no results", never a 500).
 */
export async function searchPostIds(query: string, limit = 24): Promise<number[]> {
  const q = query.trim()
  const index = getIndex()
  if (!index || !q) return []
  try {
    const res = await index.search<SearchDoc>(q, { limit, attributesToRetrieve: ['id'] })
    return res.hits.map((h) => h.id)
  } catch {
    return []
  }
}

/**
 * Reconcile one post's presence in the index from its CURRENT published state,
 * keyed by id. We re-query the published version rather than trusting a caller's
 * doc, because Payload autosave fires afterChange with the in-progress draft
 * (_status:'draft') for an already-published post — trusting that doc would evict
 * a live post from the index mid-edit (and index draft content on upsert). Reconciling
 * from the DB is correct for every transition: publish/edit → upsert the PUBLISHED
 * content; unpublish or draft-only → remove; autosave of a published post → re-upsert
 * the published content (no eviction).
 *
 * Costs one published-version query per call when enabled (incl. autosave) — the price
 * of correctness; bounded to active editing. No-op when disabled; never throws (a search
 * outage must never block a publish).
 */
export async function indexPost(id: number): Promise<void> {
  const index = getIndex()
  if (!index) return
  try {
    const payload = await getPayloadClient()
    const { docs } = await payload.find({
      collection: 'posts',
      where: { and: [{ id: { equals: id } }, { _status: { equals: 'published' } }] },
      depth: 1,
      limit: 1,
    })
    if (docs[0]) {
      await index.addDocuments([toDoc(docs[0])], { primaryKey: 'id' })
    } else {
      await index.deleteDocument(id)
    }
  } catch {
    /* indexing must never break publishing */
  }
}

/** Remove one post from the index. No-op when disabled; never throws. */
export async function removePost(id: number): Promise<void> {
  const index = getIndex()
  if (!index) return
  try {
    await index.deleteDocument(id)
  } catch {
    /* ignore */
  }
}

/**
 * Backfill: (re)configure index settings and index every published post.
 * Returns { indexed: 0 } when disabled. Used by src/seed/reindex.ts.
 * Unlike indexPost/removePost, this propagates Meilisearch/DB errors to the caller — the backfill script surfaces failures rather than silently indexing nothing.
 */
export async function reindexAllPosts(): Promise<{ indexed: number }> {
  const index = getIndex()
  if (!index) return { indexed: 0 }

  await index.updateSettings({
    searchableAttributes: ['title', 'excerpt', 'categoryName', 'authorNames'],
    displayedAttributes: ['id'],
  })

  const payload = await getPayloadClient()
  let page = 1
  let indexed = 0
  for (;;) {
    const { docs, hasNextPage } = await payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      depth: 1,
      limit: 100,
      page,
    })
    if (docs.length) {
      await index.addDocuments(docs.map(toDoc), { primaryKey: 'id' })
      indexed += docs.length
    }
    if (!hasNextPage) break
    page += 1
  }
  return { indexed }
}
