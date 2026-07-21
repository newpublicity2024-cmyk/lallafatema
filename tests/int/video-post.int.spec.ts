import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

let payload: Payload
const created: number[] = []

beforeAll(async () => {
  payload = await getPayload({ config: await config })
}, 60000)
afterAll(async () => {
  for (const id of created) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
})

/**
 * A minimal article body. Published posts must carry one — `validateArticleContent`
 * (src/lib/lexical-text.ts) rejects an empty article at publish time.
 */
const body = (text = 'نص المقال') => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'rtl' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'rtl' as const,
        children: [{ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      },
    ],
  },
})

async function categoryId(slug: string): Promise<number> {
  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  return docs[0].id as number
}

describe('Post featured video fields', () => {
  it('stores featuredType=video + featuredVideoUrl and reads them back', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'فيديو اختبار',
        category: await categoryId('video'),
        content: body(),
        featuredType: 'video',
        featuredVideoUrl: 'https://www.youtube.com/watch?v=abc123',
        _status: 'published',
      } as never,
    })
    created.push(post.id as number)
    const read = await payload.findByID({ collection: 'posts', id: post.id })
    expect(read.featuredType).toBe('video')
    expect(read.featuredVideoUrl).toBe('https://www.youtube.com/watch?v=abc123')
  }, 30000)

  it('defaults featuredType to image when omitted', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'صورة اختبار',
        category: await categoryId('news'),
        content: body(),
        _status: 'published',
      } as never,
    })
    created.push(post.id as number)
    const read = await payload.findByID({ collection: 'posts', id: post.id })
    expect(read.featuredType ?? 'image').toBe('image')
  }, 30000)
})

describe('getVideoPosts', () => {
  it('returns only published video-posts, newest first', async () => {
    const { getVideoPosts } = await import('@/lib/queries')
    const vid = await payload.create({
      collection: 'posts',
      data: {
        title: 'فيديو استعلام',
        category: await categoryId('video'),
        content: body(),
        featuredType: 'video',
        featuredVideoUrl: 'https://youtu.be/qqq111',
        _status: 'published',
      } as never,
    })
    created.push(vid.id as number)
    const img = await payload.create({
      collection: 'posts',
      data: {
        title: 'مقال صورة',
        category: await categoryId('news'),
        content: body(),
        _status: 'published',
      } as never,
    })
    created.push(img.id as number)

    const { docs } = await getVideoPosts({ limit: 100 })
    const ids = docs.map((d) => d.id)
    expect(ids).toContain(vid.id)
    expect(ids).not.toContain(img.id)
    expect(docs.every((d) => d.featuredType === 'video')).toBe(true)
    // Two round-trip creates plus a query — same 30s budget as the sibling tests
    // above. It had been running on the 5s default with ~1.4s of headroom, so it
    // tipped over under full-suite load.
  }, 30000)
})
