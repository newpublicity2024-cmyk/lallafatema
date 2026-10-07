'use client'

import { useState } from 'react'

import { parseEmbed, type ParsedEmbed } from '@/lib/embeds'
import { PlayIcon } from '../icons'
import {
  EMBED_ALLOW,
  PROVIDER_LABELS,
  displayHost,
  embedFrameClass,
  embedPlayerSrc,
  safeExternalHref,
} from './embed-ui'

/** The brand play badge, shared by the facade and matching `VideoPlayer`'s. */
function PlayBadge() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20 transition-transform group-hover:scale-105 sm:h-20 sm:w-20">
        <PlayIcon className="ms-1" width={32} height={32} />
      </span>
    </span>
  )
}

/**
 * A provider we trust but cannot embed as a real player — or an unparseable link.
 *
 * Shown as a card rather than silently dropped: an editor who pasted an X/Twitter link
 * intended the reader to see something there, and swallowing it would make the article
 * quietly incomplete with nothing in the UI to explain why. The card is also the ONLY place
 * a pasted URL reaches the DOM, which is why the href goes through `safeExternalHref` and
 * degrades to inert text when it is not a plain http(s) link.
 */
function LinkCard({ url, caption }: { url: string; caption?: string | null }) {
  const href = safeExternalHref(url)
  const host = href ? displayHost(href) : null

  return (
    <figure data-testid="lf-link-card" className="my-6">
      <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
            <path
              d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <path
              d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 007.07 7.07L13 19"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          {host && <span className="block text-xs font-bold text-brand-700">{host}</span>}
          {href ? (
            <a
              href={href}
              target="_blank"
              // noopener: the opened tab must not get a `window.opener` handle back into
              // this page. noreferrer and nofollow keep the magazine from lending its
              // referrer or its ranking to an arbitrary editor-pasted destination.
              rel="noopener noreferrer nofollow"
              className="block truncate text-sm font-medium text-zinc-900 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
            >
              {caption || url}
            </a>
          ) : (
            // Not a link we will click for the reader. Rendered as text so an editor can
            // see — in preview and in production — exactly what they pasted.
            <span className="block truncate text-sm text-zinc-600">{caption || url}</span>
          )}
          <span className="mt-0.5 block text-xs text-zinc-500">
            {href ? 'فتح الرابط في نافذة جديدة' : 'رابط غير مدعوم'}
          </span>
        </span>
      </div>
    </figure>
  )
}

/**
 * Click-to-load facade: the provider's own poster frame plus a play badge, swapped for the
 * real iframe only once the reader asks.
 *
 * Worth it ONLY where the provider hands us a poster URL we can derive offline. Where it
 * does not (Vimeo, Facebook, Instagram, TikTok all gate poster frames behind an API key or
 * a signed CDN link), a facade degrades into a branded grey box hiding the content, which
 * is worse than the embed it is protecting the reader from — those providers get a real,
 * lazily-loaded iframe instead. See `MediaEmbed` for the branch.
 */
function EmbedFacade({ parsed, title }: { parsed: ParsedEmbed; title: string }) {
  const [playing, setPlaying] = useState(false)
  const providerName = PROVIDER_LABELS[parsed.provider]

  if (playing) {
    return (
      <div className={embedFrameClass(parsed)}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embedPlayerSrc(parsed, true)}
          title={title}
          allow={EMBED_ALLOW}
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <div className={`group ${embedFrameClass(parsed)}`}>
      <div data-testid="lf-embed-poster" className="absolute inset-0">
        {parsed.thumbnailUrl && (
          // A THIRD-PARTY poster, so deliberately NOT next/image: that routes through
          // this project's custom Cloudflare loader (lib/image-loader.ts), which only
          // fronts our own object storage, so an optimized <Image> here resolves to a URL
          // that 404s in production. Same house pattern as VideoPlayer and admin/Logo.tsx.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={parsed.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <button
        type="button"
        data-testid="lf-embed-play"
        onClick={() => setPlaying(true)}
        aria-label={`تشغيل الفيديو على ${providerName}: ${title}`}
        className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      >
        <PlayBadge />
      </button>
    </div>
  )
}

/**
 * The public renderer for the `videoEmbed` block, and for any other place an editor-pasted
 * media URL has to become something safe on a page.
 *
 * THE ONE INVARIANT: every `src` it emits comes from `parseEmbed`, which rebuilds the URL
 * from a hard-coded provider origin plus a charset-validated id. The pasted string never
 * reaches an `src`, so a URL carrying `?utm_source=...&x="><script>` cannot smuggle anything
 * into the frame — the query string is simply not carried forward. The ONLY place pasted
 * text reaches an attribute at all is the fallback link card, and it is gated on
 * `safeExternalHref`.
 *
 * Returns `null` for an empty url. That is the shape of a half-filled block an editor is
 * still working on, and an empty figure with a caption and no media reads as a rendering
 * bug to the reader — there is nothing to say yet, so we say nothing.
 */
export function MediaEmbed({ url, caption }: { url: string; caption?: string | null }) {
  const trimmed = typeof url === 'string' ? url.trim() : ''
  if (!trimmed) return null

  const parsed = parseEmbed(trimmed)
  const visibleCaption = typeof caption === 'string' && caption.trim() ? caption : null

  if (!parsed) return <LinkCard url={trimmed} caption={visibleCaption} />

  const providerName = PROVIDER_LABELS[parsed.provider]
  const title = visibleCaption || `فيديو ${providerName}`

  return (
    <figure data-testid="lf-embed" data-provider={parsed.provider} className="my-6">
      {parsed.thumbnailUrl ? (
        <EmbedFacade parsed={parsed} title={title} />
      ) : (
        <div className={embedFrameClass(parsed)}>
          {/* loading="lazy" rather than a facade: these providers expose no derivable
              poster, so the embed itself is the only thing that can show the reader what
              was linked. Lazy loading still keeps it off the initial critical path. */}
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedPlayerSrc(parsed, false)}
            title={title}
            loading="lazy"
            allow={EMBED_ALLOW}
            allowFullScreen
          />
        </div>
      )}
      {visibleCaption && (
        <figcaption className="mt-2 text-sm leading-relaxed text-brand-700">{visibleCaption}</figcaption>
      )}
    </figure>
  )
}
