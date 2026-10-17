import type { Metadata } from 'next'
import { Fragment } from 'react'

import { AdSlot } from '@/components/AdSlot'
import { HeroFeature } from '@/components/HeroFeature'
import { LeadListBlock } from '@/components/LeadListBlock'
import { MagazineSection } from '@/components/MagazineSection'
import { SectionBlock } from '@/components/SectionBlock'
import { VideoSection } from '@/components/VideoSection'
import type { Category, Post, YoutubeVideo } from '@/payload-types'
import { magazineInsertAfterIndex } from '@/lib/homepage'
import {
  getCategories,
  getHomepage,
  getLatestMagazineIssues,
  getLatestPosts,
  getLatestChannelVideos,
  getPostsByCategory,
  getSiteConfig,
} from '@/lib/queries'
import { buildMetadata, ogImageUrl } from '@/lib/seo'

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

  // Video band: the latest uploads of the Lalla Fatema YouTube channel, mirrored into the
  // database by the /sync-youtube cron. Shorts and editor-hidden videos are filtered out
  // by the query itself. Toggle-gated, as before.
  //
  // Pinned videos lead and the latest fill the rest, so a half-filled pin list still
  // yields a full band — the same "pin, then fall back to latest" rule the hero and the
  // category sections above already follow.
  const videoBand = homepage.videoBand
  const showVideoBand = videoBand?.enabled ?? true
  let videos: YoutubeVideo[] = []
  if (showVideoBand) {
    const pinned = (videoBand?.pinnedVideos ?? []).filter(
      (v): v is YoutubeVideo => typeof v === 'object' && v !== null && v.hidden !== true,
    )
    const latest = await getLatestChannelVideos(5)
    const pinnedIds = new Set(pinned.map((v) => v.id))
    videos = [...pinned, ...latest.filter((v) => !pinnedIds.has(v.id))].slice(0, 5)
  }

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

  const magazineIssues = await getLatestMagazineIssues(6)
  const magazineAfter = magazineInsertAfterIndex(standard.map((s) => s.category.slug ?? ''))

  const showBetweenAd = homepage.ads?.betweenSections ?? true

  return (
    <div>
      <HeroFeature posts={heroPosts} />

      {featured && featured.posts.length > 0 && (
        <LeadListBlock
          category={featured.category}
          posts={featured.posts}
          title={featured.title}
          magazineIssue={magazineIssues[0] ?? null}
          band
        />
      )}

      {/* Video band placed directly after the مشاهير (celebrities) feature. */}
      {showVideoBand && videos.length > 0 && <VideoSection videos={videos} />}

      {/* Between-bands ad — renders nothing (no gap) when none is scheduled. */}
      {showBetweenAd && <AdSlot placement="between-sections" className="my-8 px-4" />}

      {standard.map(({ category, posts, title }, i) => (
        <Fragment key={category.id}>
          {i === 0 && magazineAfter < 0 && <MagazineSection issues={magazineIssues} />}
          <SectionBlock category={category} posts={posts} title={title} band={i % 2 === 1} />
          {i === magazineAfter && <MagazineSection issues={magazineIssues} />}
        </Fragment>
      ))}
    </div>
  )
}
