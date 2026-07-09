import type { Where } from 'payload'

import type { Ad, Category, MagazineIssue, Media, Page, Post, User, Video } from '@/payload-types'
import {
  FOOTER_PAGES,
  NEWPUB_LINKS,
  SITE,
  SOCIAL_LABELS,
  SOCIAL_LINKS,
  type SocialKey,
} from './site'
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

export async function getSiteSettings() {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'site-settings', depth: 1 })
}

export type SiteConfig = {
  name: string
  tagline: string
  logo: Media | null
  defaultOgImage: Media | null
  social: { key: SocialKey; label: string; href: string }[]
  footerPages: { label: string; href: string }[]
  newpubLinks: { label: string; href: string }[]
  headScripts: string
  bodyScripts: string
  analyticsId: string
  adsEnabled: boolean
  consentEnabled: boolean
  privacyPolicyUrl: string
}

/**
 * Resolved site config: DB-managed Site Settings merged over the original
 * `src/lib/site.ts` constants as fallbacks, so the site is fully editable yet
 * never blank if the global hasn't been filled in. Components consume this single
 * normalized shape instead of reading the raw global.
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  const s = await getSiteSettings()
  const asMedia = (v: unknown): Media | null => (v && typeof v === 'object' ? (v as Media) : null)

  const social = (s.social ?? [])
    .filter((row) => row.url)
    .map((row) => ({
      key: row.platform as SocialKey,
      label: SOCIAL_LABELS[row.platform as SocialKey] ?? row.platform,
      href: row.url,
    }))

  const footerPages = (s.footerPages ?? [])
    .filter((p) => p.label && p.href)
    .map((p) => ({ label: p.label, href: p.href }))

  const newpubLinks = (s.newpubLinks ?? [])
    .filter((p) => p.label && p.href)
    .map((p) => ({ label: p.label, href: p.href }))

  return {
    name: s.name || SITE.name,
    tagline: s.tagline || SITE.tagline,
    logo: asMedia(s.logo),
    defaultOgImage: asMedia(s.defaultOgImage),
    social: social.length ? social : SOCIAL_LINKS,
    footerPages: footerPages.length ? footerPages : FOOTER_PAGES,
    newpubLinks: newpubLinks.length ? newpubLinks : NEWPUB_LINKS,
    headScripts: s.headScripts ?? '',
    bodyScripts: s.bodyScripts ?? '',
    analyticsId: s.analyticsId ?? '',
    adsEnabled: s.adsEnabled ?? true,
    consentEnabled: s.consentEnabled ?? true,
    privacyPolicyUrl: s.privacyPolicyUrl || '/privacy',
  }
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
    // depth 1 resolves seo.ogImage (upload) so category OG metadata can use it.
    depth: 1,
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

export async function getLatestVideos(limit = 5): Promise<Video[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'videos',
    where: PUBLISHED,
    sort: ['-publishedAt', '-createdAt'],
    limit,
    depth: 1,
  })
  return docs
}

type AdPlacement = Ad['placement']

/**
 * Active ads for a placement, highest `priority` first.
 *
 * The schedule window (active + start/end) is enforced here in the query, not just
 * in the collection's `read` access — the Local API runs with `overrideAccess` by
 * default, so a paused/expired creative would otherwise leak to visitors.
 *
 * Category targeting is applied in JS: an ad with no `categories` shows everywhere;
 * an ad with categories shows only when `categoryId` matches one of them. (Expressing
 * "no targeting OR matches" on a hasMany relationship in a single `Where` is awkward,
 * and ad volume is tiny, so a post-filter is both simpler and correct.)
 */
export async function getActiveAds(placement: AdPlacement, categoryId?: number): Promise<Ad[]> {
  // Master switch — lets an admin pause all ads site-wide without deleting them.
  const { adsEnabled } = await getSiteConfig()
  if (!adsEnabled) return []

  const payload = await getPayloadClient()
  const now = new Date().toISOString()
  const { docs } = await payload.find({
    collection: 'ads',
    where: {
      and: [
        { placement: { equals: placement } },
        { active: { equals: true } },
        { or: [{ startDate: { exists: false } }, { startDate: { less_than_equal: now } }] },
        { or: [{ endDate: { exists: false } }, { endDate: { greater_than_equal: now } }] },
      ],
    },
    sort: ['-priority', '-createdAt'],
    limit: 20,
    depth: 1,
  })

  return docs.filter((ad) => {
    const targets = ad.categories
    if (!targets || targets.length === 0) return true
    if (!categoryId) return false
    return targets.some((c) => (typeof c === 'object' ? c.id : c) === categoryId)
  })
}

/** First active ad for a placement (most slots show a single creative). */
export async function getActiveAd(placement: AdPlacement, categoryId?: number): Promise<Ad | null> {
  const ads = await getActiveAds(placement, categoryId)
  return ads[0] ?? null
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

/**
 * Published posts for the given ids, returned in the SAME order as `ids`.
 * Postgres `IN` doesn't preserve order, but Meilisearch relevance ranking must
 * survive the fetch — so we re-sort by the input order. Empty input → [] (no query).
 */
export async function getPostsByIds(ids: number[]): Promise<Post[]> {
  if (!ids.length) return []
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    where: { and: [PUBLISHED, { id: { in: ids } }] },
    depth: 1,
    limit: ids.length,
  })
  const order = new Map(ids.map((id, i) => [id, i]))
  return [...docs].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

/** One published video by id, or null. `depth:1` populates thumbnail + category. */
export async function getVideoById(id: number): Promise<Video | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'videos',
    where: { and: [{ id: { equals: id } }, PUBLISHED] },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** Related videos: same category first (excluding self), topped up with latest. */
export async function getRelatedVideos(video: Video, limit = 5): Promise<Video[]> {
  const payload = await getPayloadClient()
  const categoryId =
    video.category && typeof video.category === 'object' ? video.category.id : video.category
  const out: Video[] = []
  const seen = new Set<number>([video.id])

  if (categoryId) {
    const { docs } = await payload.find({
      collection: 'videos',
      where: { and: [{ category: { equals: categoryId } }, { id: { not_equals: video.id } }, PUBLISHED] },
      sort: ['-publishedAt', '-createdAt'],
      depth: 1,
      limit,
    })
    for (const v of docs) {
      out.push(v)
      seen.add(v.id)
    }
  }
  if (out.length < limit) {
    for (const v of await getLatestVideos(limit + 1)) {
      if (out.length >= limit) break
      if (!seen.has(v.id)) {
        out.push(v)
        seen.add(v.id)
      }
    }
  }
  return out.slice(0, limit)
}

/** All published magazine issues, newest first. `depth:1` populates covers. */
export async function getMagazineIssues(): Promise<MagazineIssue[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'magazine-issues',
    where: { _status: { equals: 'published' } },
    sort: '-issueNumber',
    depth: 1,
    limit: 200,
  })
  return docs
}

/** One published issue by its number, or null. `depth:1` populates cover + pdf. */
export async function getMagazineIssueByNumber(issueNumber: number): Promise<MagazineIssue | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'magazine-issues',
    where: {
      and: [{ issueNumber: { equals: issueNumber } }, { _status: { equals: 'published' } }],
    },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** One published static/legal page by slug. Drafts return null. */
export async function getPageBySlug(slug: string): Promise<Page | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    limit: 1,
    // depth 1 resolves seo.ogImage (upload) for page OG metadata.
    depth: 1,
  })
  return docs[0] ?? null
}

/** One page by id. Public reads see published only; preview (draft=true) sees the latest draft. */
export async function getPageById(id: number, draft = false): Promise<Page | null> {
  const payload = await getPayloadClient()
  try {
    const page = await payload.findByID({ collection: 'pages', id, depth: 1, draft })
    if (!draft && page._status !== 'published') return null
    return page
  } catch {
    return null
  }
}

/** All published pages (slug + updatedAt) — for the sitemap and static params. */
export async function getPublishedPages(): Promise<Pick<Page, 'slug' | 'updatedAt'>[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 100,
    depth: 0,
  })
  return docs.map((d) => ({ slug: d.slug, updatedAt: d.updatedAt }))
}
