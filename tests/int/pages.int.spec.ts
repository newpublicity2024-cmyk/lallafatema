import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import config from '@/payload.config'
import { getPageById, getPageBySlug, getPublishedPages } from '@/lib/queries'

let payload: Payload
const PUB_SLUG = 'test-page-pub-8a1'
const DRAFT_SLUG = 'test-page-draft-8a1'
let pubId: number | string
let draftId: number | string

describe('page queries', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const pub = await payload.create({
      collection: 'pages',
      data: { title: 'صفحة منشورة للاختبار', slug: PUB_SLUG, _status: 'published' },
    })
    pubId = pub.id
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'صفحة مسودة للاختبار', slug: DRAFT_SLUG, _status: 'draft' },
    })
    draftId = draft.id
  })

  afterAll(async () => {
    await payload.delete({ collection: 'pages', id: pubId })
    await payload.delete({ collection: 'pages', id: draftId })
  })

  it('returns a published page by slug', async () => {
    const page = await getPageBySlug(PUB_SLUG)
    expect(page?.slug).toBe(PUB_SLUG)
  })

  it('returns null for an unknown slug', async () => {
    expect(await getPageBySlug('no-such-page-zzz-8a1')).toBeNull()
  })

  it('returns null for a draft (unpublished) page', async () => {
    expect(await getPageBySlug(DRAFT_SLUG)).toBeNull()
  })

  it('getPublishedPages includes the published page, excludes the draft', async () => {
    const slugs = (await getPublishedPages()).map((p) => p.slug)
    expect(slugs).toContain(PUB_SLUG)
    expect(slugs).not.toContain(DRAFT_SLUG)
  })

  it('getPageById returns a published page by id', async () => {
    const page = await getPageById(Number(pubId))
    expect(page?.slug).toBe(PUB_SLUG)
  })

  it('getPageById hides an unpublished draft from public reads (draft=false)', async () => {
    expect(await getPageById(Number(draftId))).toBeNull()
  })

  it('getPageById returns the draft in preview mode (draft=true) — the /preview fix', async () => {
    const page = await getPageById(Number(draftId), true)
    expect(page?.slug).toBe(DRAFT_SLUG)
  })

  it('getPageById returns null for a nonexistent id', async () => {
    expect(await getPageById(999999999, true)).toBeNull()
  })
})
