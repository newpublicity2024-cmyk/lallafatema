import { getNonEmptyCategories, getLatestPosts, getSiteConfig } from '@/lib/queries'
import { absoluteUrl } from '@/lib/seo'
import { postUrl, categoryUrl } from '@/lib/routes'

export const revalidate = 3600

export async function GET() {
  const [cfg, categories, posts] = await Promise.all([
    getSiteConfig(),
    getNonEmptyCategories(),
    getLatestPosts(20),
  ])

  const lines: string[] = [
    `# ${cfg.name}`,
    '',
    `> ${cfg.tagline}`,
    '',
    'مجلة لالة فاطمة موقع إخباري مغربي موجّه للمرأة، يغطي المشاهير والموضة والجمال والصحة والمطبخ وأسلوب الحياة باللغة العربية.',
    '',
    '## الأقسام',
    '',
    ...categories
      .filter((c) => c.slug)
      .map((c) => `- [${c.name}](${absoluteUrl(categoryUrl(c.slug as string))})`),
    '',
    '## أحدث المقالات',
    '',
    ...posts.map((p) => `- [${p.title}](${absoluteUrl(postUrl(p))})`),
    '',
  ]

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
