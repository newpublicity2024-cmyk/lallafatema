import { parseEmbed } from '@/lib/embeds'

/**
 * The Lalla Fatema YouTube channel, normalised into something the site can render.
 *
 * This module is the PURE half of the channel integration: given the bytes of a channel
 * feed (or a page of Data API JSON, normalised by `youtube-source.ts`), it produces
 * validated {@link ChannelVideo} records. It performs no I/O, imports nothing
 * environment-specific, and never throws — which is what lets the same code be exercised
 * by the test suite, by the gate checkers and by the cron route without a running server.
 *
 * WHY A FEED AND NOT THE ARTICLES. The homepage video band used to be fed by
 * `getLatestVideoPosts()`, i.e. articles whose featured media happens to be a video. That
 * made the band a by-product of the editorial calendar: it only moved when somebody wrote
 * an article. The channel publishes several times a day, so the band now mirrors the
 * channel and refreshes itself.
 *
 * SECURITY POSTURE — identical to `embeds.ts`, and for the same reason. Everything in a
 * channel feed is text chosen by whoever uploaded the video: titles, descriptions and the
 * thumbnail URL all arrive as strings and all end up in rendered HTML. So:
 *
 *   1. The video id is the ONLY thing carried forward from the feed into any URL, and it
 *      is validated against a strict charset first.
 *   2. Every URL we emit (watch link, iframe src, poster) is REBUILT by `parseEmbed` from
 *      a hard-coded origin plus that validated id. The feed's own `media:thumbnail` URL is
 *      read for nothing — it is attacker-influenced, and `i2.ytimg.com` vs `i3.ytimg.com`
 *      is not information worth trusting input for.
 *   3. Titles and descriptions are decoded but never parsed as markup. React escapes them
 *      at render; nothing here produces `dangerouslySetInnerHTML`.
 *   4. Anything that fails validation is dropped from the result. There is no
 *      "sanitise and keep" path.
 *
 * Routing the URL construction through `parseEmbed` is deliberate rather than convenient:
 * it means the band's iframes are built by the same parser as every article embed, so they
 * inherit the `youtube-nocookie.com` origin that the site's CSP already allowlists. A
 * second, parallel definition of "the YouTube embed URL" is exactly how a band ends up
 * rendering blank iframes in production.
 */

/**
 * The channel confirmed with the owner: "LALLA FATEMA TV لالة فاطمة", the magazine's own
 * channel (it links back to lallafatema.ma and has published since 2013).
 *
 * Hard-coded as the DEFAULT rather than required as configuration, because the alternative
 * is a feature that silently renders nothing until somebody remembers to set an
 * environment variable in Vercel. `YOUTUBE_CHANNEL_ID` overrides it when set.
 */
export const LALLA_FATEMA_CHANNEL_ID = 'UCgJShJYlHW79y-ETvEqTI9w'

/** A channel id is `UC` followed by 22 characters of the same charset ids use. */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/

/** YouTube video ids are 11 characters today; the bound is loose but the charset is not. */
const VIDEO_ID = /^[A-Za-z0-9_-]{1,24}$/

/** Longest feed we will attempt to parse. A channel feed is ~25 KB; this is 400x headroom. */
const MAX_FEED_BYTES = 10 * 1024 * 1024

/** Upper bound on a stored title/description, so a hostile feed cannot bloat a row. */
const MAX_TITLE = 300
const MAX_DESCRIPTION = 2000

export type ChannelVideoSource = 'rss' | 'api'

export type ChannelVideo = {
  /** Provider-native id, validated against a strict charset. Never raw input. */
  videoId: string
  title: string
  description: string | null
  /** ISO-8601 instant the video went public. */
  publishedAt: string
  /** Rebuilt poster URL: hard-coded origin + validated id. Never the feed's own URL. */
  thumbnailUrl: string
  /** True for a vertical Short. Excluded from the band — see `queries.ts`. */
  isShort: boolean
  views: number | null
  durationSeconds: number | null
}

/* -------------------------------------------------------------------------- */
/* Channel reference                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A channel id from a bare id or a `youtube.com/channel/<id>` URL, else null.
 *
 * Handles (`@lallafatema`) and legacy vanity paths (`/c/Name`, `/user/Name`) are
 * deliberately NOT accepted. They cannot be resolved to a channel id without a network
 * round trip, and a function that sometimes does I/O and sometimes does not is the kind of
 * surprise that gets called during a render. Resolve a handle once, by hand, and configure
 * the id.
 */
export function parseChannelId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 200) return null

  if (CHANNEL_ID.test(trimmed)) return trimmed

  // Only an https YouTube URL is read; everything else (including http, and any other
  // host that merely contains a channel-shaped string) is refused.
  if (!/^https:\/\//i.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.username !== '' || url.password !== '' || url.port !== '') return null

  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'channel') return null
  return CHANNEL_ID.test(segments[1] ?? '') ? segments[1] : null
}

/**
 * The channel the site syncs, from `YOUTUBE_CHANNEL_ID` when it is a valid reference and
 * from {@link LALLA_FATEMA_CHANNEL_ID} otherwise.
 *
 * A malformed override falls back rather than throwing: a typo in a Vercel environment
 * variable should degrade to "still syncing the right channel", not take the homepage down.
 */
export function resolvedChannelId(): string {
  return parseChannelId(process.env.YOUTUBE_CHANNEL_ID) ?? LALLA_FATEMA_CHANNEL_ID
}

/** The public Atom feed of a channel's uploads. No API key, no quota, latest ~15 videos. */
export function channelFeedUrl(channelId: string): string {
  const id = parseChannelId(channelId)
  if (!id) throw new Error('channelFeedUrl: invalid channel id')
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`
}

/* -------------------------------------------------------------------------- */
/* URLs — all rebuilt through the shared embed parser                         */
/* -------------------------------------------------------------------------- */

type VideoUrls = { watchUrl: string; embedSrc: string; thumbnailUrl: string }

/**
 * Watch link, iframe src and poster for a video id, or null if the id is not one we accept.
 *
 * Delegating to `parseEmbed` keeps a single definition of each of these shapes in the
 * codebase, which is the same reason `lib/video.ts` delegates rather than re-implementing.
 */
export function videoUrls(videoId: string): VideoUrls | null {
  if (!VIDEO_ID.test(videoId)) return null
  const parsed = parseEmbed(`https://www.youtube.com/watch?v=${videoId}`)
  if (!parsed || parsed.provider !== 'youtube' || !parsed.thumbnailUrl) return null
  return {
    watchUrl: parsed.canonicalUrl,
    embedSrc: parsed.embedSrc,
    thumbnailUrl: parsed.thumbnailUrl,
  }
}

/* -------------------------------------------------------------------------- */
/* Feed parsing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The five predefined XML entities plus numeric references.
 *
 * Hand-rolled rather than pulled from a parser dependency: the feed is Atom with a fixed
 * shape, this runs inside a cron and a server component, and adding an XML parser to the
 * runtime bundle to read six fields is not a trade worth making. Note what is deliberately
 * absent — no entity DECLARATION is ever honoured, so a feed carrying a `<!DOCTYPE>` with
 * an external entity gets its `&xxe;` left as literal text instead of expanded.
 */
function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]{1,7});/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand last: decoding it first would let `&amp;lt;` become `<`.
    .replace(/&amp;/g, '&')
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** First capture of `pattern` in `block`, XML-decoded and trimmed, or null. */
function field(block: string, pattern: RegExp): string | null {
  const match = pattern.exec(block)
  if (!match || typeof match[1] !== 'string') return null
  const value = decodeXml(match[1]).trim()
  return value === '' ? null : value
}

/**
 * Strip control characters that have no business in a title and would otherwise reach the
 * database and the page. Normal whitespace is collapsed, not removed.
 */
function clean(value: string | null, max: number): string | null {
  if (value === null) return null
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[ --]/g, '')
  const collapsed = stripped.replace(/[ \t]+/g, ' ').trim()
  if (collapsed === '') return null
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

/**
 * Parse a channel Atom feed into videos, newest first.
 *
 * Never throws and never returns a partially-validated record: an entry without a valid
 * id, a usable title or a parseable date is dropped. A caller can treat every returned
 * record as safe to store and render.
 */
export function parseChannelFeed(xml: unknown): ChannelVideo[] {
  if (typeof xml !== 'string' || xml === '' || xml.length > MAX_FEED_BYTES) return []

  const videos: ChannelVideo[] = []
  const seen = new Set<string>()

  // Split on the entry boundary rather than matching across it: a regex spanning
  // `<entry>…</entry>` with a lazy body is the classic place to accidentally write
  // catastrophic backtracking into a parser that runs on remote input.
  for (const block of xml.split('<entry>').slice(1)) {
    const end = block.indexOf('</entry>')
    const entry = end === -1 ? block : block.slice(0, end)

    const rawId = field(entry, /<yt:videoId>([^<]*)<\/yt:videoId>/)
    if (!rawId || !VIDEO_ID.test(rawId) || seen.has(rawId)) continue

    const urls = videoUrls(rawId)
    if (!urls) continue

    const title = clean(
      field(entry, /<title[^>]*>([\s\S]*?)<\/title>/) ??
        field(entry, /<media:title[^>]*>([\s\S]*?)<\/media:title>/),
      MAX_TITLE,
    )
    if (!title) continue

    const publishedRaw = field(entry, /<published>([^<]*)<\/published>/)
    const published = publishedRaw ? new Date(publishedRaw) : null
    if (!published || Number.isNaN(published.getTime())) continue

    // SHORTS. The entry's own alternate link is the authoritative signal in a feed:
    // YouTube points a Short at `/shorts/<id>` and everything else at `/watch?v=<id>`.
    // Nothing else in the Atom payload distinguishes them — there is no duration and no
    // aspect ratio — so the API path in `youtube-source.ts` has to fall back to duration.
    const alternate = /<link[^>]+rel="alternate"[^>]*href="([^"]*)"/.exec(entry)?.[1] ?? ''
    const isShort = /^https:\/\/www\.youtube\.com\/shorts\//.test(decodeXml(alternate))

    const viewsRaw = /<media:statistics[^>]*views="([0-9]{1,15})"/.exec(entry)?.[1]
    const views = viewsRaw ? Number(viewsRaw) : null

    seen.add(rawId)
    videos.push({
      videoId: rawId,
      title,
      description: clean(
        field(entry, /<media:description[^>]*>([\s\S]*?)<\/media:description>/),
        MAX_DESCRIPTION,
      ),
      publishedAt: published.toISOString(),
      thumbnailUrl: urls.thumbnailUrl,
      isShort,
      views: views !== null && Number.isFinite(views) ? views : null,
      durationSeconds: null,
    })
  }

  return videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )
}

/* -------------------------------------------------------------------------- */
/* Duration                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * ISO-8601 duration (`PT4M32S`) to seconds, as the Data API returns it. Null when absent
 * or malformed — a missing duration is not an error, it is simply unknown.
 */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim())
  if (!match) return null
  const [, d, h, m, s] = match
  if (!d && !h && !m && !s) return null
  const total = Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
  return Number.isFinite(total) ? Math.round(total) : null
}

/** `04:32`, or null when the duration is unknown. Used for the VideoObject markup. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
