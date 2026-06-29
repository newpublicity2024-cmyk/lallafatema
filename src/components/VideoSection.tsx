import type { Video } from '@/payload-types'
import { categoryUrl } from '@/lib/routes'
import { SectionHeading } from './SectionHeading'
import { VideoCard } from './VideoCard'

/**
 * The video band — foochia's highlight: a dark magenta/purple full-bleed section
 * with a lead player and a stacked list, magenta play overlays, light headings.
 */
export function VideoSection({ videos, title = 'فيديو' }: { videos: Video[]; title?: string }) {
  if (!videos.length) return null
  const [lead, ...rest] = videos
  const list = rest.slice(0, 4)

  return (
    <section className="lf-band-dark text-white">
      <div className="lf-container py-12">
        <SectionHeading title={title} href={categoryUrl('video')} light />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VideoCard video={lead} variant="lead" />
          {list.length > 0 && (
            <div className="flex flex-col gap-4">
              {list.map((video) => (
                <VideoCard key={video.id} video={video} variant="list" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
