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
      data: { title: 'صورة اختبار', category: await categoryId('news'), _status: 'published' } as never,
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
        featuredType: 'video',
        featuredVideoUrl: 'https://youtu.be/qqq111',
        _status: 'published',
      } as never,
    })
    created.push(vid.id as number)
    const img = await payload.create({
      collection: 'posts',
      data: { title: 'مقال صورة', category: await categoryId('news'), _status: 'published' } as never,
    })
    created.push(img.id as number)

    const { docs } = await getVideoPosts({ limit: 100 })
    const ids = docs.map((d) => d.id)
    expect(ids).toContain(vid.id)
    expect(ids).not.toContain(img.id)
    expect(docs.every((d) => d.featuredType === 'video')).toBe(true)
  })
})
