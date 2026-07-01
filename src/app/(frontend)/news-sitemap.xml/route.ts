import { getPayloadClient } from '@/lib/payload'
import { absoluteUrl } from '@/lib/seo'
import { postUrl } from '@/lib/routes'
import { SITE } from '@/lib/site'

export const revalidate = 600

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET() {
  const payload = await getPayloadClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { docs } = await payload.find({
    collection: 'posts',
    where: {
      and: [{ _status: { equals: 'published' } }, { publishedAt: { greater_than_equal: cutoff } }],
    },
    sort: '-publishedAt',
    limit: 1000,
    depth: 1,
  })

  const items = docs
    .map((p) => {
      const pub = p.publishedAt || p.createdAt
      return `<url><loc>${escape(absoluteUrl(postUrl(p)))}</loc><news:news><news:publication><news:name>${escape(
        SITE.name,
      )}</news:name><news:language>ar</news:language></news:publication><news:publication_date>${escape(pub)}</news:publication_date><news:title>${escape(
        p.title,
      )}</news:title></news:news></url>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${items}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
