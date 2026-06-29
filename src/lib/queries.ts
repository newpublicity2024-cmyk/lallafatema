import type { Where } from 'payload'

import type { Category, Post, User } from '@/payload-types'
import { getPayloadClient } from './payload'

const PUBLISHED: Where = { _status: { equals: 'published' } }

export async function getHomepage() {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'homepage', depth: 2 })
}

export async function getMainMenu() {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'main-menu', depth: 1 })
}

export async function getCategories(): Promise<Category[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'categories',
    limit: 100,
    sort: 'createdAt',
    depth: 1,
  })
  return docs
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}

type PostQuery = {
  limit?: number
  page?: number
  categoryId?: number
  excludeIds?: number[]
}

export async function getPosts({ limit = 12, page = 1, categoryId, excludeIds }: PostQuery = {}) {
  const payload = await getPayloadClient()
  const and: Where[] = [PUBLISHED]
  if (categoryId) and.push({ category: { equals: categoryId } })
  if (excludeIds?.length) and.push({ id: { not_in: excludeIds } })

  return payload.find({
    collection: 'posts',
    where: { and },
    sort: ['-publishedAt', '-createdAt'],
    limit,
    page,
    depth: 1,
  })
}

export async function getLatestPosts(limit = 12, excludeIds?: number[]): Promise<Post[]> {
  const { docs } = await getPosts({ limit, excludeIds })
  return docs
}

export async function getPostsByCategory(categoryId: number, limit = 6): Promise<Post[]> {
  const { docs } = await getPosts({ categoryId, limit })
  return docs
}

export async function getPostById(id: number, draft = false): Promise<Post | null> {
  const payload = await getPayloadClient()
  try {
    const post = await payload.findByID({ collection: 'posts', id, depth: 2, draft })
    // Public reads only see published; preview (draft=true) sees the latest draft.
    if (!draft && post._status !== 'published') return null
    return post
  } catch {
    return null
  }
}

export async function getRelatedPosts(post: Post, limit = 4): Promise<Post[]> {
  const categoryId =
    post.category && typeof post.category === 'object' ? post.category.id : post.category
  if (!categoryId) return getLatestPosts(limit, [post.id])
  const { docs } = await getPosts({ categoryId, limit, excludeIds: [post.id] })
  return docs
}

export async function getAuthorById(id: number): Promise<User | null> {
  const payload = await getPayloadClient()
  try {
    return await payload.findByID({ collection: 'users', id, depth: 1 })
  } catch {
    return null
  }
}

export async function getPostsByAuthor(authorId: number, limit = 12, page = 1) {
  const payload = await getPayloadClient()
  return payload.find({
    collection: 'posts',
    where: { and: [PUBLISHED, { authors: { in: [authorId] } }] },
    sort: ['-publishedAt', '-createdAt'],
    limit,
    page,
    depth: 1,
  })
}
