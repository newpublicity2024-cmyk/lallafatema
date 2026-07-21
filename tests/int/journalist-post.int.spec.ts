import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

/**
 * Round-trip coverage for the authoring automation.
 *
 * The unit tests call `applyPostDefaults` directly, so they would all still pass
 * if the hook were unwired from the collection. This exercises the real stack —
 * Payload create → hooks → Postgres → read back — and is what actually proves a
 * journalist can save an article while supplying none of the plumbing fields.
 */
let payload: Payload
const createdPosts: number[] = []
let journalistId: number

const EMAIL = 'int-journalist@payloadcms.com'

const body = (text: string) => ({
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
        children: [
          { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})

beforeAll(async () => {
  payload = await getPayload({ config: await config })

  await payload.delete({ collection: 'users', where: { email: { equals: EMAIL } } })
  const journalist = await payload.create({
    collection: 'users',
    data: {
      email: EMAIL,
      password: 'test',
      name: 'صحفي الاختبار',
      role: 'journalist',
    } as never,
  })
  journalistId = journalist.id as number
}, 60000)

afterAll(async () => {
  for (const id of createdPosts) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
  await payload
    .delete({ collection: 'users', where: { email: { equals: EMAIL } } })
    .catch(() => {})
})

async function categoryId(slug: string): Promise<number> {
  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  return docs[0].id as number
}

describe('a journalist saving an article', () => {
  it('fills in slug, author, excerpt and featuredType without being asked for any of them', async () => {
    const post = await payload.create({
      collection: 'posts',
      // Exactly what the reduced journalist form submits: title, category, body.
      data: {
        title: 'إطلالة جديدة للفنانة في حفل الجوائز',
        category: await categoryId('news'),
        content: body('نص المقال الكامل يبدأ من هنا ويكمل بعدها.'),
      } as never,
      user: { id: journalistId, role: 'journalist' } as never,
      overrideAccess: false,
    })
    createdPosts.push(post.id as number)

    const read = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })

    // Slug generated from the Arabic title.
    expect(read.slug).toBe('إطلالة-جديدة-للفنانة-في-حفل-الجوائز')
    // Authorship defaulted to the creating journalist.
    expect(read.authors).toEqual([journalistId])
    // Excerpt derived from the body.
    expect(read.excerpt).toBe('نص المقال الكامل يبدأ من هنا ويكمل بعدها.')
    // No video URL was supplied, so the header is an image.
    expect(read.featuredType).toBe('image')
  }, 30000)

  it('derives a video header when the journalist pastes a link', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'مقابلة مصورة',
        category: await categoryId('news'),
        content: body('تفاصيل المقابلة.'),
        featuredVideoUrl: 'https://www.youtube.com/watch?v=zzz999',
      } as never,
      user: { id: journalistId, role: 'journalist' } as never,
      overrideAccess: false,
    })
    createdPosts.push(post.id as number)

    const read = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })
    expect(read.featuredType).toBe('video')
  }, 30000)

  it('refuses to let a journalist publish', async () => {
    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: 'محاولة نشر',
          category: await categoryId('news'),
          content: body('نص.'),
          _status: 'published',
        } as never,
        user: { id: journalistId, role: 'journalist' } as never,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/غير مسموح/)
  }, 30000)
})
