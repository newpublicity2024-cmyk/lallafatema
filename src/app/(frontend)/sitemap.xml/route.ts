import { getPayloadClient } from '@/lib/payload'
import { SITE_URL, absoluteUrl } from '@/lib/seo'
import { postUrl, categoryUrl, authorUrl } from '@/lib/routes'

export const revalidate = 3600

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function urlTag(loc: string, lastmod?: string) {
  return `<url><loc>${escape(loc)}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}</url>`
}

export async function GET() {
  const payload = await getPayloadClient()

  const [posts, categories, authors] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 2000,
      depth: 1,
    }),
    payload.find({ collection: 'categories', limit: 200, depth: 0 }),
    payload.find({ collection: 'users', limit: 200, depth: 0 }),
  ])

  const urls: string[] = [urlTag(SITE_URL)]

  for (const c of categories.docs) {
    if (c.slug) urls.push(urlTag(absoluteUrl(categoryUrl(c.slug))))
  }
  for (const a of authors.docs) {
    urls.push(urlTag(absoluteUrl(authorUrl(a.id))))
  }
  for (const p of posts.docs) {
    urls.push(urlTag(absoluteUrl(postUrl(p)), (p.updatedAt || p.publishedAt || undefined) ?? undefined))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
