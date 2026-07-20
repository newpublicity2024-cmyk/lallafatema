import { getPayloadClient } from '@/lib/payload'
import { SITE_URL, absoluteUrl } from '@/lib/seo'
import { getPublishedPages } from '@/lib/queries'
import { postUrl, categoryUrl, authorUrl, magazineArchiveUrl, magazineIssueUrl, videosListingUrl, pageUrl } from '@/lib/routes'

export const revalidate = 3600

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function urlTag(loc: string, lastmod?: string) {
  return `<url><loc>${escape(loc)}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}</url>`
}

export async function GET() {
  const payload = await getPayloadClient()

  const [posts, categories, issues, pages] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 2000,
      depth: 1,
    }),
    payload.find({ collection: 'categories', limit: 200, depth: 0 }),
    payload.find({
      collection: 'magazine-issues',
      where: { _status: { equals: 'published' } },
      sort: '-issueNumber',
      limit: 500,
      depth: 0,
    }),
    getPublishedPages(),
  ])

  const urls: string[] = [urlTag(SITE_URL)]

  // Only advertise categories that actually contain published posts — an empty
  // category is thin content and shouldn't be offered to crawlers. Derived from the
  // posts already fetched above (no extra query).
  const nonEmptyCategoryIds = new Set<number>()
  for (const p of posts.docs) {
    const cid = p.category && typeof p.category === 'object' ? p.category.id : p.category
    if (typeof cid === 'number') nonEmptyCategoryIds.add(cid)
  }
  for (const c of categories.docs) {
    if (c.slug && nonEmptyCategoryIds.has(c.id)) urls.push(urlTag(absoluteUrl(categoryUrl(c.slug))))
  }

  urls.push(urlTag(absoluteUrl(videosListingUrl())))

  // Author pages: only authors who have at least one published post (derived from
  // the posts above), so admin/editor accounts with no bylines aren't advertised.
  const authorIds = new Set<number>()
  for (const p of posts.docs) {
    for (const a of p.authors ?? []) {
      authorIds.add(typeof a === 'object' ? a.id : a)
    }
  }
  for (const id of authorIds) {
    urls.push(urlTag(absoluteUrl(authorUrl(id))))
  }

  for (const p of posts.docs) {
    urls.push(urlTag(absoluteUrl(postUrl(p)), (p.updatedAt || p.publishedAt || undefined) ?? undefined))
  }

  if (issues.docs.length) {
    urls.push(urlTag(absoluteUrl(magazineArchiveUrl())))
    for (const m of issues.docs) {
      urls.push(urlTag(absoluteUrl(magazineIssueUrl(m)), m.updatedAt ?? undefined))
    }
  }

  for (const p of pages) {
    if (p.slug) urls.push(urlTag(absoluteUrl(pageUrl(p.slug)), p.updatedAt ?? undefined))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
