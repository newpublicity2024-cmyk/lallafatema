import { HeroFeature } from '@/components/HeroFeature'
import { LeadListBlock } from '@/components/LeadListBlock'
import { SectionBlock } from '@/components/SectionBlock'
import { VideoSection } from '@/components/VideoSection'
import type { Category, Post } from '@/payload-types'
import {
  getCategories,
  getHomepage,
  getLatestPosts,
  getLatestVideos,
  getPostsByCategory,
} from '@/lib/queries'

// ISR: statically generated; refreshed on publish via the afterChange hook,
// with a long fallback interval as a safety net.
export const revalidate = 3600

const onlyPublished = (items: (number | Post)[] | null | undefined): Post[] =>
  (items ?? []).filter((p): p is Post => typeof p === 'object' && p._status === 'published')

export default async function HomePage() {
  const homepage = await getHomepage()

  // Hero: admin-pinned posts, else latest overall.
  let heroPosts = onlyPublished(homepage.heroPosts)
  if (heroPosts.length === 0) heroPosts = await getLatestPosts(5)

  // Sections: admin-configured, else every top-level category (latest 4).
  let sections: { category: Category; posts: Post[]; title?: string }[]

  if (homepage.sections && homepage.sections.length > 0) {
    sections = await Promise.all(
      homepage.sections.map(async (s) => {
        const category = s.category as Category
        const pinned = onlyPublished(s.pinnedPosts)
        const posts = pinned.length
          ? pinned.slice(0, s.limit ?? 4)
          : await getPostsByCategory(category.id, s.limit ?? 4)
        return { category, posts, title: s.titleOverride || undefined }
      }),
    )
  } else {
    const topLevel = (await getCategories()).filter((c) => !c.parent && c.slug !== 'video')
    sections = await Promise.all(
      topLevel.map(async (category) => ({
        category,
        posts: await getPostsByCategory(category.id, 4),
      })),
    )
  }

  const videos = await getLatestVideos(5)

  // First section is rendered as the asymmetric featured block; the rest are
  // standard 4-up rows on alternating white / zinc-50 bands.
  const [featured, ...standard] = sections

  return (
    <main>
      <HeroFeature posts={heroPosts} />

      {featured && featured.posts.length > 0 && (
        <LeadListBlock
          category={featured.category}
          posts={featured.posts}
          title={featured.title}
          band
        />
      )}

      {standard.map(({ category, posts, title }, i) => (
        <SectionBlock
          key={category.id}
          category={category}
          posts={posts}
          title={title}
          band={i % 2 === 1}
        />
      ))}

      <VideoSection videos={videos} />
    </main>
  )
}
