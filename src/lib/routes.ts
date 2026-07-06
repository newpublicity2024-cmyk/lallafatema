import type { Category, MagazineIssue, Post } from '@/payload-types'

/**
 * URL scheme (RTL Arabic magazine):
 *   category   →  /<categorySlug>
 *   article    →  /<categorySlug>/<slug>-<id>   (numeric id = stable permalink part)
 *   author     →  /author/<id>
 *
 * The stable `-<id>` suffix means the human slug can change without breaking links.
 */

const catSlugOf = (category: Post['category']): string => {
  if (category && typeof category === 'object') return (category as Category).slug ?? 'news'
  return 'news'
}

export function categoryUrl(slug: string): string {
  return `/${slug}`
}

export function postUrl(post: Pick<Post, 'id' | 'slug' | 'category'>): string {
  const cat = catSlugOf(post.category)
  const slug = post.slug || 'post'
  return `/${cat}/${slug}-${post.id}`
}

export function authorUrl(id: number | string): string {
  return `/author/${id}`
}

/** Extract the numeric id from a `<slug>-<id>` URL segment. */
export function idFromSlugParam(param: string): number | null {
  const match = param.match(/-(\d+)$/)
  if (!match) {
    // bare numeric id is also accepted
    return /^\d+$/.test(param) ? Number(param) : null
  }
  return Number(match[1])
}

/** Magazine archive listing. */
export function magazineArchiveUrl(): string {
  return '/magazine'
}

/** Permalink for one digital issue — keyed on the unique, required issueNumber. */
export function magazineIssueUrl(issue: Pick<MagazineIssue, 'issueNumber'>): string {
  return `/magazine/${issue.issueNumber}`
}

/** Parse a `/magazine/[issueNumber]` route param → positive integer, else null. */
export function issueNumberFromParam(param: string): number | null {
  return /^\d+$/.test(param) ? Number(param) : null
}
