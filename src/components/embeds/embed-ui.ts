import type { EmbedProvider, ParsedEmbed } from '@/lib/embeds'

/**
 * Presentation-layer companion to `src/lib/embeds.ts`.
 *
 * `lib/embeds.ts` answers "is this URL a provider we trust, and what is its rebuilt src?".
 * It is pure, dependency-free and shared with field validation and the CSP, so it has no
 * business knowing about aspect ratios or Arabic labels. Everything a *renderer* needs on
 * top of a `ParsedEmbed` lives here instead, in one place, so the header player and the
 * in-body block cannot drift apart on, say, which providers autoplay.
 */

/** Arabic provider names, for link cards, aria-labels and "open on <provider>" affordances. */
export const PROVIDER_LABELS: Record<EmbedProvider, string> = {
  youtube: 'يوتيوب',
  vimeo: 'فيميو',
  dailymotion: 'ديلي موشن',
  facebook: 'فيسبوك',
  instagram: 'إنستغرام',
  tiktok: 'تيك توك',
}

/**
 * The `allow` policy handed to every provider iframe.
 *
 * Deliberately a short allowlist rather than the kitchen sink most embed snippets ship:
 * `autoplay` is needed because our players only ever start after an explicit click,
 * `encrypted-media` because DRM-protected catalogue video is otherwise a black frame, and
 * `picture-in-picture` / `fullscreen` because readers expect them. Nothing here grants
 * camera, microphone, geolocation or payment, which the vendors' own snippets often do.
 */
export const EMBED_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share'

/**
 * Providers whose embed endpoint honours an autoplay parameter.
 *
 * Only consulted when the reader has ALREADY clicked a play control, so this never
 * autoplays unprompted. The rest (Facebook, Instagram, TikTok) render their own in-frame
 * play button and ignore — or in TikTok's case, break on — extra query parameters, so we
 * hand them their src untouched.
 */
const AUTOPLAY_PROVIDERS: ReadonlySet<EmbedProvider> = new Set<EmbedProvider>([
  'youtube',
  'vimeo',
  'dailymotion',
])

/**
 * The final iframe `src`.
 *
 * Built from `parsed.embedSrc` — which `lib/embeds.ts` already rebuilt from a hard-coded
 * origin plus a charset-validated id — and NEVER from the pasted URL. The separator is
 * computed rather than assumed because Facebook's plugin endpoint already carries a query
 * string (`/plugins/video.php?href=...`); blindly appending `?autoplay=1` would corrupt it
 * into a second question mark and a dead frame.
 *
 * The YouTube parameters are all privacy/UX hardening, not decoration: `rel=0` stops the
 * end-card from recommending unrelated channels, `modestbranding=1` drops the YouTube
 * wordmark overlay, `playsinline=1` stops iOS Safari from hijacking the video into its
 * native fullscreen player, and `hl=ar` puts the player chrome in the reader's language.
 */
export function embedPlayerSrc(parsed: ParsedEmbed, autoplay: boolean): string {
  if (!autoplay || !AUTOPLAY_PROVIDERS.has(parsed.provider)) return parsed.embedSrc
  const separator = parsed.embedSrc.includes('?') ? '&' : '?'
  if (parsed.provider === 'youtube') {
    return `${parsed.embedSrc}${separator}autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=ar`
  }
  return `${parsed.embedSrc}${separator}autoplay=1`
}

/**
 * True when the provider renders a portrait frame.
 *
 * Reels, TikToks and Instagram posts are 9:16 or taller. Forcing them into a 16:9 box is
 * what produces the pillar-boxed postage stamp you see on most news sites that bolted a
 * reel embed onto a video component: the frame is wide, the content is tall, and the actual
 * video ends up a fraction of the space it was given.
 */
export function isPortraitEmbed(parsed: ParsedEmbed): boolean {
  if (parsed.provider === 'tiktok') return true
  if (parsed.provider === 'instagram') return true
  return parsed.kind === 'reel'
}

/**
 * The frame wrapper's classes for an in-body embed.
 *
 * Portrait frames are width-capped and centred: left to fill an article column they would
 * become a two-screen-tall slab on desktop. `w-full` with no `min-width` anywhere is what
 * keeps the article off a horizontal scrollbar at 375px.
 */
export function embedFrameClass(parsed: ParsedEmbed): string {
  if (!isPortraitEmbed(parsed)) return 'relative aspect-video w-full overflow-hidden rounded-xl bg-brand-900'
  const ratio = parsed.provider === 'instagram' && parsed.kind === 'post' ? 'aspect-[4/5]' : 'aspect-[9/16]'
  return `relative mx-auto w-full max-w-[420px] ${ratio} overflow-hidden rounded-xl bg-brand-900`
}

/**
 * The pasted URL, echoed back ONLY when it is a plain http(s) link we are willing to put in
 * an `href`, else `null`.
 *
 * This is the last line of defence on the fallback path. An editor-pasted
 * `javascript:alert(1)` or `data:text/html,<script>` is refused upstream by
 * `parseEmbed`, but the fallback path exists precisely for URLs the parser rejected — so
 * without this check the one place a hostile URL can still land in the DOM is the "we could
 * not embed it, here is the link" branch. React blocks `javascript:` hrefs itself; it does
 * NOT block `data:`, so relying on the framework here would be relying on half a mitigation.
 *
 * Returns the trimmed input rather than `URL.href` so the href is byte-for-byte the link the
 * editor pasted — normalising it (adding a trailing slash, re-encoding a path) would quietly
 * change which resource the reader is sent to.
 */
export function safeExternalHref(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 2048) return null
  // Test the raw prefix before parsing: a scheme `new URL` normalises into something
  // surprising never reaches the protocol check.
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Userinfo makes the real host ambiguous to a human reader (`https://bank.com@evil.tld`
    // reads as the bank but resolves to evil.tld), so refuse rather than resolve it.
    if (url.username !== '' || url.password !== '') return null
    return trimmed
  } catch {
    return null
  }
}

/** The host to show on a link card, without the noise of `www.`. */
export function displayHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
