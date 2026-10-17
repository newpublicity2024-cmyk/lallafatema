'use client'

import { useState } from 'react'

import type { YoutubeVideo } from '@/payload-types'
import { YoutubeVideoFrame } from './YoutubeVideoFrame'

/**
 * The /videos listing: a grid of channel videos, each playing in its own cell.
 *
 * Unlike the homepage band there is no lead slot to promote into, so a cell swaps its own
 * poster for the iframe. Only one plays at a time — starting a second stops the first,
 * which keeps the page to a single third-party frame and avoids two Arabic voice-overs
 * talking over each other, the thing readers actually complain about on listing pages that
 * allow concurrent playback.
 *
 * Grid cells are 16:9 and wide enough for a real player (half the viewport on a phone is
 * too small, so the grid drops to one column below `sm`).
 */
export function YoutubeVideoGrid({ videos }: { videos: YoutubeVideo[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video, i) => (
        <article key={video.videoId} className="group">
          <YoutubeVideoFrame
            video={video}
            large
            priority={i < 3}
            playing={playingId === video.videoId}
            onPlay={() => setPlayingId(video.videoId)}
          />
          <h2 className="mt-3 line-clamp-3 text-base leading-snug font-bold text-zinc-900">
            {video.title}
          </h2>
          <time
            dateTime={video.publishedAt}
            className="mt-1 block text-xs text-zinc-500"
            suppressHydrationWarning
          >
            {new Intl.DateTimeFormat('ar-MA', { dateStyle: 'long' }).format(
              new Date(video.publishedAt),
            )}
          </time>
        </article>
      ))}
    </div>
  )
}
