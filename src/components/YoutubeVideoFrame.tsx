'use client'

import type { YoutubeVideo } from '@/payload-types'
import { parseEmbed } from '@/lib/embeds'
import { videoUrls } from '@/lib/youtube'
import { EMBED_ALLOW, embedPlayerSrc } from './embeds/embed-ui'
import { PlayIcon } from './icons'

/** The magenta play disc. Purely decorative — the control is whatever wraps it. */
function PlayBadge({ large }: { large: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-300 group-hover:scale-105"
    >
      <span
        className={`grid place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20 ${
          large ? 'h-16 w-16' : 'h-10 w-10'
        }`}
      >
        <PlayIcon className="ms-0.5" width={large ? 30 : 20} height={large ? 30 : 20} />
      </span>
    </span>
  )
}

/**
 * One channel video as a 16:9 click-to-load frame: poster plus a play button, with the
 * YouTube `<iframe>` created only once the reader asks for it.
 *
 * WHY A FACADE AND NOT FIVE IFRAMES. The band shows five videos above the fold. Five
 * YouTube iframes is roughly two megabytes of third-party JavaScript on the critical path
 * of the magazine's busiest page, and every one of them sets profiling cookies on load.
 * The poster is a single ~15 KB JPEG. This is the same trade the article header already
 * makes in `VideoPlayer`, and the reason the src resolves to `youtube-nocookie.com`.
 *
 * The poster is a plain `<img>`, NOT `next/image`, and deliberately so: this project sets
 * `images.loader: 'custom'` pointing at a Cloudflare zone that fronts our own object
 * storage, so an optimized `<Image>` would rewrite a YouTube URL into something that 404s
 * in production. Same reasoning, and the same house pattern, as `VideoPlayer` and
 * `admin/Logo.tsx`.
 */
export function YoutubeVideoFrame({
  video,
  playing,
  onPlay,
  priority = false,
  large = false,
  interactive = true,
  className = '',
}: {
  video: YoutubeVideo
  playing: boolean
  onPlay: () => void
  /** The lead frame fetches its poster eagerly; the rest stay lazy. */
  priority?: boolean
  large?: boolean
  /**
   * False when an ancestor is already the control — the band's list rows wrap the whole
   * row in one button, and a `<button>` inside a `<button>` is invalid HTML that React
   * will also refuse to hydrate cleanly. The frame then renders as pure decoration.
   */
  interactive?: boolean
  className?: string
}) {
  const urls = videoUrls(video.videoId)
  const parsed = urls ? parseEmbed(urls.watchUrl) : null

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-xl bg-brand-900 ${className}`}
    >
      {playing && parsed ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embedPlayerSrc(parsed, true)}
          title={video.title}
          allow={EMBED_ALLOW}
          allowFullScreen
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnailUrl}
            alt=""
            aria-hidden
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {parsed ? (
            interactive ? (
              <button
                type="button"
                onClick={onPlay}
                aria-label={`تشغيل: ${video.title}`}
                className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              >
                <PlayBadge large={large} />
              </button>
            ) : (
              <PlayBadge large={large} />
            )
          ) : null}
        </>
      )}
    </div>
  )
}
