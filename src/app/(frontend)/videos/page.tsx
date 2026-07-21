import type { Metadata } from 'next'

import { JsonLd } from '@/components/JsonLd'
import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getSiteConfig, getVideoPosts } from '@/lib/queries'
import { videosListingUrl } from '@/lib/routes'
import { buildMetadata, breadcrumbJsonLd, ogImageUrl } from '@/lib/seo'

export const revalidate = 300

type Props = { searchParams: Promise<{ page?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'فيديو',
    description: 'أحدث مقاطع الفيديو من لالة فاطمة.',
    path: videosListingUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
    type: 'website',
  })
}

export default async function VideosPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const { docs, totalPages } = await getVideoPosts({ limit: 16, page })

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
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {docs.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination basePath={videosListingUrl()} page={page} totalPages={totalPages} />
    </div>
  )
}
