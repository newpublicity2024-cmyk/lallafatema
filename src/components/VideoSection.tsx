import type { Post } from '@/payload-types'
import { videosListingUrl } from '@/lib/routes'
import { SectionHeading } from './SectionHeading'
import { VideoCard } from './VideoCard'

/**
 * The video band — foochia's highlight: a dark magenta/purple full-bleed section
 * with a lead player and a stacked list, magenta play overlays, light headings.
 */
export function VideoSection({ videos, title = 'فيديو' }: { videos: Post[]; title?: string }) {
  if (!videos.length) return null
  const [lead, ...rest] = videos
  const list = rest.slice(0, 4)

  return (
    <section className="lf-band-dark text-white">
      <div className="lf-container py-12">
        <SectionHeading title={title} href={videosListingUrl()} light />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VideoCard post={lead} variant="lead" />
          {list.length > 0 && (
            <div className="flex flex-col gap-4">
              {list.map((post) => (
                <VideoCard key={post.id} post={post} variant="list" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
