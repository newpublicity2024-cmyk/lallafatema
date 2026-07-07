import { beforeAll, describe, expect, it } from 'vitest'

import { indexPost, reindexAllPosts, removePost, searchEnabled, searchPostIds } from '@/lib/search'
import { searchIndexAfterChange, searchIndexAfterDelete } from '@/hooks/searchIndex'
import { getPostsByIds } from '@/lib/queries'

// This suite runs WITHOUT Meilisearch credentials, verifying the inert contract:
// the provider is a safe no-op / empty and never throws when disabled.
describe('search provider (inert without credentials)', () => {
  beforeAll(() => {
    // Hermetic: guarantee "disabled" regardless of the ambient environment.
    delete process.env.MEILISEARCH_HOST
    delete process.env.MEILISEARCH_API_KEY
  })

  it('is disabled when the env vars are absent', () => {
    expect(searchEnabled()).toBe(false)
  })

  it('searchPostIds returns [] when disabled', async () => {
    await expect(searchPostIds('فستان')).resolves.toEqual([])
  })

  it('searchPostIds returns [] for a blank query', async () => {
    await expect(searchPostIds('   ')).resolves.toEqual([])
  })

  it('indexPost is a no-op that never throws when disabled', async () => {
    await expect(indexPost(1)).resolves.toBeUndefined()
  })

  it('removePost is a no-op that never throws when disabled', async () => {
    await expect(removePost(1)).resolves.toBeUndefined()
  })

  it('reindexAllPosts returns { indexed: 0 } when disabled', async () => {
    await expect(reindexAllPosts()).resolves.toEqual({ indexed: 0 })
  })
})

describe('search index hooks (inert without credentials)', () => {
  it('afterChange returns the doc unchanged and never throws when disabled', async () => {
    const doc = { id: 1, title: 'عنوان', _status: 'published' }
    // The hook only reads `doc`; other hook args are irrelevant here.
    const result = await searchIndexAfterChange({ doc } as never)
    expect(result).toBe(doc)
  })

  it('afterDelete returns the doc unchanged and never throws when disabled', async () => {
    const doc = { id: 1, title: 'عنوان' }
    const result = await searchIndexAfterDelete({ doc } as never)
    expect(result).toBe(doc)
  })
})

describe('getPostsByIds', () => {
  it('returns [] for empty input without touching the DB', async () => {
    await expect(getPostsByIds([])).resolves.toEqual([])
  })
})
