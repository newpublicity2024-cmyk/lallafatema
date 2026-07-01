import type { Metadata } from 'next'

import { AdSlot } from '@/components/AdSlot'
import { HeroFeature } from '@/components/HeroFeature'
import { JsonLd } from '@/components/JsonLd'
import { LeadListBlock } from '@/components/LeadListBlock'
import { SectionBlock } from '@/components/SectionBlock'
import { VideoSection } from '@/components/VideoSection'
import type { Category, Post, Video } from '@/payload-types'
import {
  getCategories,
  getHomepage,
  getLatestPosts,
  getLatestVideos,
  getPostsByCategory,
  getSiteConfig,
} from '@/lib/queries'
import { buildMetadata, ogImageUrl, videoObjectJsonLd } from '@/lib/seo'

// ISR: statically generated; refreshed on publish via the afterChange hook,
// with a long fallback interval as a safety net.
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: cfg.name,
    description: cfg.tagline,
    path: '/',
    image: ogImageUrl(cfg.defaultOgImage),
    type: 'website',
  })
}

const onlyPublished = (items: (number | Post)[] | null | undefined): Post[] =>
  (items ?? []).filter((p): p is Post => typeof p === 'object' && p._status === 'published')

const onlyPublishedVideos = (items: (number | Video)[] | null | undefined): Video[] =>
  (items ?? []).filter((v): v is Video => typeof v === 'object' && v._status === 'published')

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

  // Video band: admin-pinned videos win, else latest. Hidden if the toggle is off.
  const videoBand = homepage.videoBand
  const showVideoBand = videoBand?.enabled ?? true
  const pinnedVideos = onlyPublishedVideos(videoBand?.pinnedVideos)
  const videos = showVideoBand
    ? pinnedVideos.length
      ? pinnedVideos
      : await getLatestVideos(5)
    : []

  // The featured (LeadListBlock) section is admin-selectable; default to the first.
  const featuredCategoryId =
    homepage.featuredCategory && typeof homepage.featuredCategory === 'object'
      ? homepage.featuredCategory.id
      : homepage.featuredCategory
  const featuredIndex = featuredCategoryId
    ? Math.max(0, sections.findIndex((s) => s.category.id === featuredCategoryId))
    : 0
  const featured = sections[featuredIndex]
  const standard = sections.filter((_, i) => i !== featuredIndex)

  const showBetweenAd = homepage.ads?.betweenSections ?? true

  return (
    <main>
      {/* VideoObject requires a thumbnailUrl — only emit for videos that have one. */}
      {videos
        .filter((v) => v.thumbnail && typeof v.thumbnail === 'object' && v.thumbnail.url)
        .map((v) => (
          <JsonLd key={v.id} data={videoObjectJsonLd(v)} />
        ))}
      <HeroFeature posts={heroPosts} />

      {featured && featured.posts.length > 0 && (
        <LeadListBlock
          category={featured.category}
          posts={featured.posts}
          title={featured.title}
          band
        />
      )}

      {/* Video band placed directly after the مشاهير (celebrities) feature. */}
      {showVideoBand && videos.length > 0 && <VideoSection videos={videos} />}

      {/* Between-bands ad — renders nothing (no gap) when none is scheduled. */}
      {showBetweenAd && <AdSlot placement="between-sections" className="my-8 px-4" />}

      {standard.map(({ category, posts, title }, i) => (
        <SectionBlock
          key={category.id}
          category={category}
          posts={posts}
          title={title}
          band={i % 2 === 1}
        />
      ))}
    </main>
  )
}
