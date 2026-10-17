import type { YoutubeVideo } from '@/payload-types'
import { videosListingUrl } from '@/lib/routes'
import { SectionHeading } from './SectionHeading'
import { YoutubeVideoBand } from './YoutubeVideoBand'

/**
 * The video band — foochia's highlight: a dark magenta/purple full-bleed section with a
 * lead player and a stacked list, magenta play overlays, light headings.
 *
 * The band's SOURCE changed (articles with a featured video → the Lalla Fatema YouTube
 * channel, synced by `/sync-youtube`) but its place in the page and its look did not. This
 * stays a server component so the heading and the band's data are rendered on the server;
 * only the player interaction below it is client-side.
 */
export function VideoSection({
  videos,
  title = 'فيديو',
}: {
  videos: YoutubeVideo[]
  title?: string
}) {
  if (!videos.length) return null

  return (
    <section className="lf-band-dark text-white">
      <div className="lf-container py-12">
        <SectionHeading title={title} href={videosListingUrl()} light />
        <YoutubeVideoBand videos={videos} />
      </div>
    </section>
  )
}
