import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { VideoPlayer } from '@/components/VideoPlayer'
import { formatDate } from '@/lib/format'
import { getSiteConfig, getVideoById } from '@/lib/queries'
import { categoryUrl, idFromSlugParam, videoWatchUrl } from '@/lib/routes'
import { breadcrumbJsonLd, buildMetadata, ogImageUrl, videoObjectJsonLd } from '@/lib/seo'
import type { Category } from '@/payload-types'

export const revalidate = 3600

type Props = { params: Promise<{ slugId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slugId } = await params
  const id = idFromSlugParam(slugId)
  if (id === null) return {}
  const video = await getVideoById(id)
  if (!video) return {}
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: video.seo?.metaTitle || video.title,
    description: video.seo?.metaDescription || video.description,
    path: videoWatchUrl(video),
    image: ogImageUrl(video.seo?.ogImage || video.thumbnail, cfg.defaultOgImage),
    canonicalOverride: video.seo?.canonicalURL,
    noIndex: video.seo?.noIndex ?? undefined,
  })
}

export default async function VideoWatchPage({ params }: Props) {
  const { slugId } = await params
  const id = idFromSlugParam(slugId)
  if (id === null) notFound()

  const video = await getVideoById(id)
  if (!video) notFound()

  const category =
    video.category && typeof video.category === 'object' ? (video.category as Category) : null

  return (
    <div>
      <JsonLd data={videoObjectJsonLd(video)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'فيديو', url: categoryUrl('video') },
          { name: video.title, url: videoWatchUrl(video) },
        ])}
      />

      <div className="lf-container py-8">
        <nav aria-label="مسار التنقل" className="mb-4 text-sm text-zinc-500">
          <Link href="/" className="hover:text-brand-600">
            الرئيسية
          </Link>
          {' / '}
          <Link href={categoryUrl('video')} className="hover:text-brand-600">
            فيديو
          </Link>
        </nav>

        <div className="mx-auto max-w-4xl">
          <VideoPlayer videoUrl={video.videoUrl} thumbnail={video.thumbnail} title={video.title} />
          <div className="mt-4">
            {category && (
              <Link
                href={categoryUrl(category.slug ?? '')}
                className="text-sm font-bold text-brand-600 hover:underline"
              >
                {category.name}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-extrabold text-zinc-900">{video.title}</h1>
            {video.publishedAt && (
              <time
                dateTime={new Date(video.publishedAt).toISOString()}
                className="mt-1 block text-sm text-zinc-500"
              >
                {formatDate(video.publishedAt)}
              </time>
            )}
            {video.description && (
              <p className="mt-3 leading-relaxed whitespace-pre-line text-zinc-700">{video.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
