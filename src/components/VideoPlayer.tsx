'use client'

import { useState } from 'react'

import type { Media } from '@/payload-types'
import { embedUrl } from '@/lib/video'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'

function PlayOverlay() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20">
        <PlayIcon className="ms-1" width={36} height={36} />
      </span>
    </span>
  )
}

/**
 * Watch-page video facade: large thumbnail + play button; the embed <iframe> loads
 * ONLY on click (CWV-safe). Unknown hosts (no embed) fall back to an external link.
 */
export function VideoPlayer({
  videoUrl,
  thumbnail,
  title,
}: {
  videoUrl: string
  thumbnail: number | Media | null | undefined
  title: string
}) {
  const [playing, setPlaying] = useState(false)
  const src = embedUrl(videoUrl)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-brand-900">
      {playing && src ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`${src}?autoplay=1`}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          {src ? (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`تشغيل: ${title}`}
              className="absolute inset-0 cursor-pointer"
            >
              <PlayOverlay />
            </button>
          ) : (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`مشاهدة: ${title}`}
              className="absolute inset-0"
            >
              <PlayOverlay />
            </a>
          )}
        </>
      )}
    </div>
  )
}
