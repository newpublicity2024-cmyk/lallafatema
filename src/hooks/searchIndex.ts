import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '@/payload-types'
import { indexPost, removePost } from '@/lib/search'

/**
 * Keep the Meilisearch index in step with Posts. Both are no-ops when search is
 * disabled (no credentials), and indexPost/removePost swallow errors, so a search
 * outage never blocks a publish. Mirrors src/hooks/revalidate.ts.
 */
export const searchIndexAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await indexPost(doc as Post)
  return doc
}

export const searchIndexAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await removePost((doc as Post).id)
  return doc
}
