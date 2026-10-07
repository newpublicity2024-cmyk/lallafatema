'use client'

import { useState } from 'react'

import type { Media } from '@/payload-types'
import { parseEmbed } from '@/lib/embeds'
import { EMBED_ALLOW, PROVIDER_LABELS, embedPlayerSrc, isPortraitEmbed, safeExternalHref } from './embeds/embed-ui'
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
 * The article HEADER video: a large poster plus a play button, with the provider `<iframe>`
 * loading ONLY on click (CWV-safe — a header iframe on the critical path is the single
 * heaviest thing a news page can ship).
 *
 * EVERY provider the shared parser knows is playable here. That is a behaviour change, and a
 * bug fix: this component used to resolve its src through the old YouTube/Vimeo-only
 * `embedUrl()`, so the 18 live posts whose `featuredVideoUrl` is an Instagram reel or post
 * fell through to the `<a href>` branch below. Their readers got a play button that
 * navigated them off the magazine instead of playing anything. Routing through `parseEmbed`
 * fixes those 18 and simultaneously moves the 61 YouTube headers onto
 * `youtube-nocookie.com`, which is the whole point of putting a facade in front of them.
 *
 * THE BOX STAYS 16:9 even for a portrait reel. Resizing the container on play would shift
 * everything below the header the instant the reader clicks — the worst possible moment for
 * a layout shift. A portrait video is instead centred and letterboxed inside the same box,
 * which is exactly what YouTube and Facebook do with vertical video.
 *
 * The `<a href>` fallback remains for genuinely unsupported providers (an X/Twitter link in
 * the field, say) because sending the reader to the source beats showing them nothing — but
 * it is now gated on `safeExternalHref`, so a `javascript:` or `data:` URL that got past
 * field validation renders as a plain poster with no control at all rather than as a
 * clickable hostile link.
 */
export function VideoPlayer({
  videoUrl,
  thumbnail,
  title,
  fallbackPosterUrl,
}: {
  videoUrl: string
  thumbnail: number | Media | null | undefined
  title: string
  /** Plain poster URL (e.g. a YouTube hqdefault) used when no Media thumbnail exists. Renders a plain <img> (no /_next/image). */
  fallbackPosterUrl?: string
}) {
  const [playing, setPlaying] = useState(false)

  const parsed = parseEmbed(videoUrl)
  const media = thumbnail && typeof thumbnail === 'object' && thumbnail.url ? thumbnail : null
  // Caller-supplied poster wins (it may be a hand-picked frame), then the provider's own
  // derivable poster. Only YouTube and Dailymotion expose one without an API key.
  const posterUrl = fallbackPosterUrl ?? parsed?.thumbnailUrl ?? null
  // Only reachable when the URL is NOT an embeddable provider — that is the whole point of
  // the fallback — and only when it is a plain http(s) link we are willing to hand a reader.
  const externalHref = parsed ? null : safeExternalHref(videoUrl)
  const providerName = parsed ? PROVIDER_LABELS[parsed.provider] : null

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-brand-900">
      {playing && parsed ? (
        // A portrait frame is centred inside the unchanged 16:9 box; `h-full` keeps it
        // within the header's height and `aspect-[9/16]` gives it its own shape.
        <div
          className={
            isPortraitEmbed(parsed)
              ? 'absolute inset-0 mx-auto aspect-[9/16] h-full'
              : 'absolute inset-0 h-full w-full'
          }
        >
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedPlayerSrc(parsed, true)}
            title={title}
            allow={EMBED_ALLOW}
            allowFullScreen
          />
        </div>
      ) : (
        <>
          {media ? (
            <PostImage image={media} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          ) : posterUrl ? (
            // A THIRD-PARTY poster, so deliberately NOT next/image: that routes through
            // this project's custom Cloudflare loader (lib/image-loader.ts), whose zone
            // fronts our own object storage only, so an optimized <Image> would resolve a
            // provider URL to something that 404s in production. Same reasoning, and the
            // same house pattern, as src/components/admin/Logo.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          )}

          {parsed ? (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`تشغيل: ${title}${providerName ? ` (${providerName})` : ''}`}
              className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
            >
              <PlayOverlay />
            </button>
          ) : externalHref ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`مشاهدة: ${title}`}
              className="absolute inset-0"
            >
              <PlayOverlay />
            </a>
          ) : null}
        </>
      )}
    </div>
  )
}
