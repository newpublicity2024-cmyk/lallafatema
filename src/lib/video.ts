import { parseEmbed } from '@/lib/embeds'

/**
 * Thin, backward-compatible facade over `src/lib/embeds.ts`.
 *
 * WHY THIS FILE STILL EXISTS. It used to be the whole video story: a hand-rolled
 * `embedUrl()` that knew YouTube and Vimeo, matched hosts with `endsWith('youtube.com')`
 * (so `evilyoutube.com` read as YouTube) and, for `/embed/` URLs, returned the pasted string
 * unchanged as an iframe src. That shipped two real defects to production:
 *
 *   1. 18 live articles carry an INSTAGRAM `featuredVideoUrl`. `embedUrl()` returned null
 *      for them, so the header fell back to `<a href>` and clicking play navigated the
 *      reader off the site instead of playing the video.
 *   2. The 61 YouTube headers were framed from `youtube.com/embed/...`, which sets its
 *      profiling cookies on load — the exact thing a click-to-load facade exists to avoid.
 *
 * Both are fixed by having ONE parser, so the rendering path can never know a different set
 * of providers (or a laxer host rule) than field validation and the CSP allowlist do. What
 * is left here is a compatibility surface, not logic: the three function names below are
 * imported by `ArticleView`, `RichTextBody` and the JSON-LD builder in `lib/seo.ts`, and
 * renaming them would be churn for no gain.
 *
 * Nothing new should import this module — reach for `parseEmbed` directly and get the
 * provider, kind, id, canonical URL and poster in one shot.
 */

/**
 * A provider's canonical PUBLIC embed URL, for structured data.
 *
 * Note the deliberate difference from `ParsedEmbed.embedSrc`: for YouTube this returns
 * `youtube.com/embed/<id>`, not `youtube-nocookie.com/embed/<id>`. They are not
 * interchangeable. `embedSrc` is what WE frame, and nocookie is the privacy-preserving alias
 * we choose for our own readers. This value goes into schema.org `VideoObject.embedUrl`,
 * which is a statement to a crawler about where the video canonically lives — and the
 * nocookie host is an alias, not the canonical location, so publishing it there would
 * describe the video with a URL Google treats as a different property.
 *
 * Returns null for anything the shared parser refuses, which now includes `http:` URLs
 * (an embed served without TLS is blocked as mixed content anyway, so claiming it is
 * embeddable would be a lie) and hosts that merely end in a provider's domain.
 */
export function embedUrl(url: string): string | null {
  const parsed = parseEmbed(url)
  if (!parsed) return null
  if (parsed.provider === 'youtube') return `https://www.youtube.com/embed/${encodeURIComponent(parsed.id)}`
  return parsed.embedSrc
}

/**
 * The YouTube video id from any YouTube URL shape, else null.
 *
 * Still YouTube-specific by design: its only callers want a YouTube poster, and YouTube is
 * the one provider in the allowlist whose thumbnail is derivable from the id alone.
 */
export function youtubeId(url: string): string | null {
  const parsed = parseEmbed(url)
  return parsed?.provider === 'youtube' ? parsed.id : null
}

/**
 * YouTube poster fallback, used when a video post has no uploaded `featuredImage`.
 *
 * Delegates to the parser's own `thumbnailUrl` so there is exactly one definition of the
 * poster URL shape in the codebase.
 */
export function youtubeThumbnailUrl(url: string): string | null {
  const parsed = parseEmbed(url)
  return parsed?.provider === 'youtube' ? parsed.thumbnailUrl : null
}
