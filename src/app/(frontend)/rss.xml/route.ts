import { getLatestPosts, getSiteConfig } from '@/lib/queries'
import { SITE_URL, absoluteUrl, ogImageUrl } from '@/lib/seo'
import { postUrl } from '@/lib/routes'

export const revalidate = 900

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export async function GET() {
  const [posts, cfg] = await Promise.all([getLatestPosts(20), getSiteConfig()])

  const items = posts
    .map((p) => {
      const link = absoluteUrl(postUrl(p))
      const pub = new Date(p.publishedAt || p.createdAt).toUTCString()
      const img = ogImageUrl(p.featuredImage, cfg.defaultOgImage)
      const cat = p.category && typeof p.category === 'object' ? p.category.name : ''
      return `<item><title>${escape(p.title)}</title><link>${escape(link)}</link><guid isPermaLink="true">${escape(
        link,
      )}</guid>${cat ? `<category>${escape(cat)}</category>` : ''}<pubDate>${pub}</pubDate><description>${escape(
        p.excerpt ?? '',
      )}</description>${img ? `<media:content url="${escape(img)}" medium="image"/>` : ''}</item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n<channel>\n<title>${escape(
    cfg.name,
  )}</title>\n<link>${SITE_URL}</link>\n<description>${escape(
    cfg.tagline,
  )}</description>\n<language>ar</language>\n${items}\n</channel>\n</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
