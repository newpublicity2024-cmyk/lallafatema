import type { Metadata } from 'next'

import { JsonLd } from '@/components/JsonLd'
import { Pagination } from '@/components/Pagination'
import { SectionHeading } from '@/components/SectionHeading'
import { YoutubeVideoGrid } from '@/components/YoutubeVideoGrid'
import { getChannelVideos, getSiteConfig } from '@/lib/queries'
import { videosListingUrl } from '@/lib/routes'
import { buildMetadata, breadcrumbJsonLd, ogImageUrl } from '@/lib/seo'

/**
 * The aggregated video listing — the "المزيد" destination of the homepage band.
 *
 * It lists the same source as the band (the Lalla Fatema YouTube channel) for the obvious
 * reason: a "see all" link that leads to a different set of videos than the one the reader
 * just clicked out of is a broken promise. Article-videos are unaffected and still play in
 * their own articles; they are simply no longer what this page aggregates.
 *
 * `revalidate` stays at 300 as a floor. In practice the page refreshes within seconds of a
 * new upload, because `/sync-youtube` calls `revalidatePath('/', 'layout')` whenever a sync
 * actually changed something.
 */
export const revalidate = 300

type Props = { searchParams: Promise<{ page?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'فيديو',
    description: 'أحدث مقاطع الفيديو من قناة لالة فاطمة على يوتيوب.',
    path: videosListingUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
    type: 'website',
  })
}

export default async function VideosPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const { docs, totalPages } = await getChannelVideos({ limit: 18, page })

  return (
    <div className="lf-container py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'فيديو', url: videosListingUrl() },
        ])}
      />
      <SectionHeading title="فيديو" />

      {docs.length === 0 ? (
        <p className="py-16 text-center text-zinc-700">لا توجد مقاطع فيديو بعد.</p>
      ) : (
        <YoutubeVideoGrid videos={docs} />
      )}

      <Pagination basePath={videosListingUrl()} page={page} totalPages={totalPages} />
    </div>
  )
}
