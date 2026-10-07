/**
 * Editor-pasted social / video URL -> a REBUILT, allowlisted iframe src.
 *
 * WHY this module exists at all (and why `video.ts` is not enough): `video.ts` was written
 * for the two hosts the original video-post block supported, and it is permissive in the
 * two ways that matter. It matches hosts with a bare `endsWith('youtube.com')` — which also
 * matches `evil-youtube.com` — and, for `/embed/` URLs, it returns the *pasted string
 * unchanged* as the iframe src. Editors paste whatever a share sheet gives them, and a
 * Payload rich-text field is reachable by every editor role, so an embed src is effectively
 * an attacker-reachable attribute on a public page.
 *
 * The posture here is therefore "rebuild, never reflect":
 *
 *   1. Only `https:` is ever accepted. No scheme is upgraded, coerced or guessed — `http:`
 *      is refused rather than silently promoted, because an editor pasting `http:` has given
 *      us no evidence the provider serves that id over TLS, and a mixed-content iframe is a
 *      silent failure in production anyway.
 *   2. Hosts are matched against a fixed set of registrable domains, exactly or on a dot
 *      boundary. `youtube.com.evil.tld` and `notyoutube.com` are not YouTube.
 *   3. The provider-native id is extracted and validated against a strict charset. An id is
 *      the only thing we carry forward from the input, and it can only ever be
 *      `[A-Za-z0-9_-]` (plus a separately validated actor segment where a permalink needs
 *      one). Anything else is a refusal, not a sanitisation.
 *   4. Every URL we emit is a hard-coded origin string concatenated with that validated id,
 *      run through `encodeURIComponent` as a second layer. The input URL is never
 *      interpolated into the output, so there is no path by which pasted text reaches an
 *      `src` attribute even if a charset check were ever loosened by mistake.
 *   5. Unsupported-but-real providers (twitter.com / x.com, short links we cannot resolve
 *      without a network round trip) return `null`. Guessing an embed shape for a provider
 *      we have not verified is how you ship a broken iframe to a public page.
 *
 * Every origin this module can emit is exported as {@link EMBED_FRAME_HOSTS} so the CSP in
 * `security-headers.ts` and the parser can never drift apart: a provider added here without
 * a matching `frame-src` entry would render a blank iframe in production.
 *
 * Pure and dependency-free on purpose — it is imported by server components, client
 * components, the test suite and the audit gates, so it must not pull in `next/*`, Payload
 * or anything environment-specific.
 */

export type EmbedProvider = 'youtube' | 'vimeo' | 'dailymotion' | 'facebook' | 'instagram' | 'tiktok'
export type EmbedKind = 'video' | 'reel' | 'post'

export type ParsedEmbed = {
  provider: EmbedProvider
  kind: EmbedKind
  /** Provider-native id, validated against a strict charset. Never raw input. */
  id: string
  /** Rebuilt iframe src: hard-coded origin + validated id. Never the pasted URL. */
  embedSrc: string
  /** Rebuilt canonical watch / permalink URL, for "open on <provider>" links and SEO. */
  canonicalUrl: string
  /** Provider thumbnail when one is reachable without an API key, else null. */
  thumbnailUrl: string | null
  /** True when the iframe must sit behind a consent / click-to-load facade. */
  requiresClickToLoad: boolean
}

/* -------------------------------------------------------------------------- */
/* Hard-coded origins. These are the ONLY strings that can become an src.     */
/* -------------------------------------------------------------------------- */

/**
 * `youtube-nocookie.com` rather than `youtube.com`: it defers the ad/profiling cookie set
 * until playback actually starts, which is what makes a click-to-load facade worth having.
 */
const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'
const YOUTUBE_WATCH_ORIGIN = 'https://www.youtube.com'
/** Matches `video.ts`'s existing poster host so the two agree on one thumbnail URL shape. */
const YOUTUBE_THUMBNAIL_ORIGIN = 'https://img.youtube.com'
const VIMEO_EMBED_ORIGIN = 'https://player.vimeo.com'
const VIMEO_WATCH_ORIGIN = 'https://vimeo.com'
const DAILYMOTION_ORIGIN = 'https://www.dailymotion.com'
const FACEBOOK_ORIGIN = 'https://www.facebook.com'
const INSTAGRAM_ORIGIN = 'https://www.instagram.com'
const TIKTOK_ORIGIN = 'https://www.tiktok.com'

/**
 * Every origin an `embedSrc` produced by {@link parseEmbed} can have — i.e. exactly the
 * `frame-src` allowlist the site CSP needs. Mirrored (deliberately, not imported) by
 * `EMBED_FRAMES` in `security-headers.ts`, because that module is loaded by `next.config.ts`
 * through an extensionless relative import and must stay import-free; a test asserts the two
 * lists are identical so the duplication cannot rot.
 */
export const EMBED_FRAME_HOSTS: readonly string[] = [
  YOUTUBE_EMBED_ORIGIN,
  VIMEO_EMBED_ORIGIN,
  DAILYMOTION_ORIGIN,
  FACEBOOK_ORIGIN,
  INSTAGRAM_ORIGIN,
  TIKTOK_ORIGIN,
]

/* -------------------------------------------------------------------------- */
/* Validation primitives                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Upper bound on the input we will even attempt to parse. A rich-text field can hold
 * megabytes; `new URL()` on a multi-megabyte string is pure waste, and no provider id lives
 * past a couple of hundred characters.
 */
const MAX_INPUT_LENGTH = 2048

/**
 * The strict id charset. Every provider below ultimately narrows to this (or to a subset of
 * it), which is also the charset that is inert in an HTML attribute, a URL path and a query
 * value simultaneously — that is the point. The bounded quantifier keeps this linear-time.
 */
const SLUG_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Numeric provider ids (Facebook object ids, Vimeo ids, TikTok snowflake ids). */
const NUMERIC_ID = /^[0-9]{1,32}$/

/**
 * Facebook actor (vanity username or page slug). Needed because a post permalink is
 * `/<actor>/posts/<id>` and cannot be rebuilt from the numeric id alone. Facebook allows
 * letters, digits and periods for people and additionally hyphens for page slugs
 * (`/Some-Page-Name-123456789/`), so those are the only extras admitted.
 */
const FACEBOOK_ACTOR = /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/

/** TikTok handle, without the leading `@`. Letters, digits, underscore and period only. */
const TIKTOK_ACTOR = /^[A-Za-z0-9._]{1,32}$/

/**
 * Facebook path segments that are routes, not actors. We already require the literal
 * `posts` segment before accepting an actor, so this is belt-and-braces against a future
 * loosening of that shape producing a nonsense permalink like `/plugins/posts/1`.
 */
const FACEBOOK_RESERVED_ACTORS: ReadonlySet<string> = new Set([
  'plugins',
  'watch',
  'watch.php',
  'reel',
  'reels',
  'video.php',
  'photo.php',
  'profile.php',
  'permalink.php',
  'story.php',
  'sharer',
  'sharer.php',
  'share',
  'dialog',
  'login',
  'login.php',
  'groups',
  'events',
  'pages',
  'marketplace',
  'media',
  'ajax',
  'tr',
  'l.php',
  'p',
])

/**
 * Exact match, or a match on a dot boundary. Deliberately NOT `endsWith(domain)`: that is
 * the bug this module exists to avoid, because `endsWith('youtube.com')` is also true of
 * `notyoutube.com` and `evilyoutube.com`.
 */
function hostMatches(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/**
 * Parse `input` into a URL we are willing to reason about, or `null`.
 *
 * Everything structural and scheme-related is refused here, once, so no per-provider branch
 * can forget a check:
 *
 * - The literal `https://` prefix is required on the *trimmed input* before parsing. Testing
 *   the raw prefix as well as `u.protocol` means a scheme that `new URL` normalises into
 *   something surprising never reaches a provider branch.
 * - Userinfo is fatal. `https://user@evil.tld@www.youtube.com/...` parses with hostname
 *   `www.youtube.com` under the URL spec (userinfo runs to the *last* `@`), so a host check
 *   alone reads it as genuine YouTube while a human reads `evil.tld`. Refuse the ambiguity
 *   instead of resolving it.
 * - An explicit port is fatal. None of these providers is served off 443, so a port is a
 *   signal that the URL points at a proxy or an interception endpoint, not at the provider.
 */
function safeHttpsUrl(input: unknown): URL | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) return null
  if (!/^https:\/\//i.test(trimmed)) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '') return null
  if (url.port !== '') return null
  if (!url.hostname) return null

  return url
}

/**
 * Hostname, lowercased by `new URL` already, with a single trailing root dot removed.
 * `www.youtube.com.` is the same host as `www.youtube.com`; normalising costs nothing here
 * because the emitted origin is hard-coded either way.
 */
function normalisedHost(url: URL): string {
  const host = url.hostname
  return host.endsWith('.') ? host.slice(0, -1) : host
}

/**
 * Non-empty path segments, still percent-encoded.
 *
 * Kept encoded on purpose: validating the *raw* segment against {@link SLUG_ID} rejects `%`
 * outright, so there is no decode step whose result could differ from what we validated.
 * Note `new URL` has already resolved `.` / `..` in the path, so a traversal attempt shows
 * up as a path that simply does not match any provider shape.
 */
function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter((segment) => segment !== '')
}

/** A validated id, or null. Query values arrive already percent-decoded from `searchParams`. */
function validId(value: string | null | undefined, pattern: RegExp = SLUG_ID): string | null {
  if (typeof value !== 'string' || value === '') return null
  return pattern.test(value) ? value : null
}

/**
 * Second encoding layer, applied to every validated value before it is concatenated into an
 * output URL.
 *
 * It is a no-op today — {@link SLUG_ID}, {@link NUMERIC_ID}, {@link FACEBOOK_ACTOR} and
 * {@link TIKTOK_ACTOR} admit only characters `encodeURIComponent` leaves alone — and that is
 * exactly why it is here: it is the layer that still holds if one of those charsets is ever
 * widened without the author noticing what else the value feeds. Every output URL below is
 * `hard-coded literal + enc(validated value)` and nothing else, so it stays audit-readable
 * by eye: if a template contains no `enc(...)`, it contains no input-derived text at all.
 */
function enc(value: string): string {
  return encodeURIComponent(value)
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] as const
const VIMEO_HOSTS = ['vimeo.com'] as const
const DAILYMOTION_HOSTS = ['dailymotion.com', 'dai.ly'] as const
const FACEBOOK_HOSTS = ['facebook.com'] as const
const INSTAGRAM_HOSTS = ['instagram.com', 'instagr.am'] as const
const TIKTOK_HOSTS = ['tiktok.com'] as const

function youtube(id: string): ParsedEmbed {
  return {
    provider: 'youtube',
    kind: 'video',
    id,
    embedSrc: `${YOUTUBE_EMBED_ORIGIN}/embed/${enc(id)}`,
    canonicalUrl: `${YOUTUBE_WATCH_ORIGIN}/watch?v=${enc(id)}`,
    thumbnailUrl: `${YOUTUBE_THUMBNAIL_ORIGIN}/vi/${enc(id)}/hqdefault.jpg`,
    requiresClickToLoad: true,
  }
}

/**
 * `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, plus `/live/<id>` and the
 * legacy `/v/<id>`, all of which share one 11-character id space. Short links on `youtu.be`
 * carry the id directly in the path, so they resolve offline — unlike `fb.watch` or
 * `vm.tiktok.com`, which are refused further down for exactly that reason.
 */
function parseYouTube(url: URL, host: string, segments: string[]): ParsedEmbed | null {
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    const id = validId(segments[0])
    return id ? youtube(id) : null
  }

  const [first, second] = segments
  if (first === 'watch') {
    const id = validId(url.searchParams.get('v'))
    return id ? youtube(id) : null
  }
  if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') {
    const id = validId(second)
    return id ? youtube(id) : null
  }
  return null
}

/**
 * `vimeo.com/<id>`, the `player.vimeo.com/video/<id>` embed form, and the channel / group
 * wrappers Vimeo still hands out from its share sheet. Only a numeric id is accepted; the
 * trailing unlisted-video hash (`vimeo.com/<id>/<hash>`) is intentionally dropped, because
 * carrying it would mean putting an access token into a public page's HTML.
 *
 * No thumbnail: Vimeo exposes poster images only through its oEmbed API, so there is no URL
 * we can synthesise from the id. Callers fall back to the post's own featured image.
 */
function parseVimeo(segments: string[]): ParsedEmbed | null {
  const first = segments[0]
  const last = segments[segments.length - 1]
  let id: string | null = null

  if (validId(first, NUMERIC_ID)) {
    id = first
  } else if (first === 'video' && segments.length >= 2) {
    // `player.vimeo.com/video/<id>` — our own embed src, so this is the idempotent path.
    id = validId(last, NUMERIC_ID)
  } else if ((first === 'channels' || first === 'groups') && segments.length >= 3) {
    // `channels/<name>/<id>` and `groups/<name>/videos/<id>`. The >= 3 floor matters: a bare
    // `channels/<name>` would otherwise read a *channel* id as a video id whenever the
    // channel name happens to be numeric, and silently embed the wrong thing.
    id = validId(last, NUMERIC_ID)
  }
  if (!id) return null

  return {
    provider: 'vimeo',
    kind: 'video',
    id,
    embedSrc: `${VIMEO_EMBED_ORIGIN}/video/${enc(id)}`,
    canonicalUrl: `${VIMEO_WATCH_ORIGIN}/${enc(id)}`,
    thumbnailUrl: null,
    requiresClickToLoad: true,
  }
}

/**
 * `dailymotion.com/video/<id>`, the `/embed/video/<id>` form, and `dai.ly/<id>` — Dailymotion's
 * short link is id-bearing, so it resolves offline. `/thumbnail/video/<id>` is a public,
 * key-free redirect to the current poster frame, so unlike Vimeo we can offer a thumbnail.
 */
function parseDailymotion(host: string, segments: string[]): ParsedEmbed | null {
  let id: string | null = null

  if (host === 'dai.ly' || host.endsWith('.dai.ly')) {
    id = validId(segments[0])
  } else if (segments[0] === 'video') {
    id = validId(segments[1])
  } else if (segments[0] === 'embed' && segments[1] === 'video') {
    id = validId(segments[2])
  }
  if (!id) return null

  return {
    provider: 'dailymotion',
    kind: 'video',
    id,
    embedSrc: `${DAILYMOTION_ORIGIN}/embed/video/${enc(id)}`,
    canonicalUrl: `${DAILYMOTION_ORIGIN}/video/${enc(id)}`,
    thumbnailUrl: `${DAILYMOTION_ORIGIN}/thumbnail/video/${enc(id)}`,
    requiresClickToLoad: true,
  }
}

/**
 * Facebook has no path-style embed endpoint: its `plugins/*.php` renderers take the
 * permalink as an `href` query parameter. That is the one place a *URL* rather than a bare
 * id ends up inside an src, so the href is the canonical URL **we** just rebuilt from the
 * hard-coded origin and the validated id — never the pasted string.
 *
 * Shapes: `/watch/?v=<id>` and `/<actor>/videos/<id>` (video), `/reel/<id>` (reel), and
 * `/<actor>/posts/<id>` (post). `fb.watch/<code>` is refused: the code is an opaque short
 * link that only Facebook can expand, and inventing an embed from it would ship a dead
 * iframe. No thumbnail — Facebook poster frames require a Graph API token.
 */
function facebook(kind: EmbedKind, id: string, canonicalUrl: string): ParsedEmbed {
  const plugin = kind === 'post' ? '/plugins/post.php?href=' : '/plugins/video.php?href='
  const showText = kind === 'post' ? '&show_text=true' : '&show_text=false'
  return {
    provider: 'facebook',
    kind,
    id,
    embedSrc: `${FACEBOOK_ORIGIN}${plugin}${enc(canonicalUrl)}${showText}`,
    canonicalUrl,
    thumbnailUrl: null,
    requiresClickToLoad: true,
  }
}

function parseFacebook(url: URL, segments: string[]): ParsedEmbed | null {
  const [first, second, third] = segments

  if (first === 'watch' || first === 'video.php' || first === 'watch.php') {
    const id = validId(url.searchParams.get('v'), NUMERIC_ID)
    return id ? facebook('video', id, `${FACEBOOK_ORIGIN}/watch/?v=${enc(id)}`) : null
  }

  if (first === 'reel' || first === 'reels') {
    const id = validId(second, NUMERIC_ID)
    return id ? facebook('reel', id, `${FACEBOOK_ORIGIN}/reel/${enc(id)}`) : null
  }

  // `/<actor>/posts/<id>` and `/<actor>/videos/<id>` both need the actor segment to rebuild
  // a permalink the plugin renderer will accept, so it is validated as strictly as the id.
  if (second === 'posts' || second === 'videos') {
    const actor = validId(first, FACEBOOK_ACTOR)
    const id = validId(third, NUMERIC_ID)
    if (!actor || !id) return null
    // `..` can only appear inside a longer segment here (FACEBOOK_ACTOR forces an
    // alphanumeric first character, so the segment is never `.` or `..`) and is therefore not
    // a traversal — but a dot run is not a real Facebook handle either, and refusing it means
    // no reader has to re-derive that argument.
    if (actor.includes('..')) return null
    if (FACEBOOK_RESERVED_ACTORS.has(actor.toLowerCase())) return null
    return second === 'posts'
      ? facebook('post', id, `${FACEBOOK_ORIGIN}/${enc(actor)}/posts/${enc(id)}`)
      : facebook('video', id, `${FACEBOOK_ORIGIN}/watch/?v=${enc(id)}`)
  }

  return null
}

/**
 * `/p/<code>/` and the legacy IGTV `/tv/<code>/` render as posts; `/reel/<code>/` and
 * `/reels/<code>/` render as reels. Instagram's own `/embed` suffix on the permalink is the
 * documented embed endpoint, so the src is a pure origin + kind + code concatenation.
 *
 * No thumbnail: Instagram removed the public `/media/?size=` endpoint, and every remaining
 * poster URL is a signed, short-lived CDN link that cannot be derived from the shortcode.
 */
function parseInstagram(segments: string[]): ParsedEmbed | null {
  const [first, second] = segments
  const kind: EmbedKind | null =
    first === 'p' || first === 'tv' ? 'post' : first === 'reel' || first === 'reels' ? 'reel' : null
  if (!kind) return null

  const id = validId(second)
  if (!id) return null

  const path = kind === 'post' ? '/p/' : '/reel/'
  return {
    provider: 'instagram',
    kind,
    id,
    embedSrc: `${INSTAGRAM_ORIGIN}${path}${enc(id)}/embed`,
    canonicalUrl: `${INSTAGRAM_ORIGIN}${path}${enc(id)}/`,
    thumbnailUrl: null,
    requiresClickToLoad: true,
  }
}

/**
 * Only `/@<handle>/video/<id>` is accepted. TikTok's own `/embed/v2/<id>` endpoint needs just
 * the id, but a canonical permalink needs the handle too, and TikTok does not serve
 * `/video/<id>` without one — so parsing a handle-less URL could only produce a
 * `canonicalUrl` that 404s. `vm.tiktok.com` / `vt.tiktok.com` short codes are refused for the
 * same offline-resolution reason as `fb.watch`. No thumbnail without the oEmbed API.
 */
function parseTikTok(segments: string[]): ParsedEmbed | null {
  const [first, second, third] = segments
  if (typeof first !== 'string' || !first.startsWith('@')) return null
  if (second !== 'video') return null

  const actor = validId(first.slice(1), TIKTOK_ACTOR)
  const id = validId(third, NUMERIC_ID)
  if (!actor || !id) return null

  return {
    provider: 'tiktok',
    kind: 'video',
    id,
    embedSrc: `${TIKTOK_ORIGIN}/embed/v2/${enc(id)}`,
    canonicalUrl: `${TIKTOK_ORIGIN}/@${enc(actor)}/video/${enc(id)}`,
    thumbnailUrl: null,
    requiresClickToLoad: true,
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parse a pasted URL into a rebuilt, allowlisted embed descriptor, or `null` when the URL is
 * not a supported provider — which includes every malformed, hostile and merely-unsupported
 * input. `null` is the only failure mode: this never throws, and never returns a partially
 * validated result, so a caller can treat a non-null return as safe to put in an `src`.
 */
export function parseEmbed(input: string): ParsedEmbed | null {
  const url = safeHttpsUrl(input)
  if (!url) return null

  const host = normalisedHost(url)
  const segments = pathSegments(url)

  if (hostMatches(host, YOUTUBE_HOSTS)) return parseYouTube(url, host, segments)
  if (hostMatches(host, VIMEO_HOSTS)) return parseVimeo(segments)
  if (hostMatches(host, DAILYMOTION_HOSTS)) return parseDailymotion(host, segments)
  if (hostMatches(host, FACEBOOK_HOSTS)) return parseFacebook(url, segments)
  if (hostMatches(host, INSTAGRAM_HOSTS)) return parseInstagram(segments)
  if (hostMatches(host, TIKTOK_HOSTS)) return parseTikTok(segments)

  return null
}

/**
 * Whether {@link parseEmbed} can turn `input` into an embed. Delegates rather than
 * re-implementing the rules, so the predicate used by field validation can never disagree
 * with the parser used by rendering.
 */
export function isEmbeddable(input: string): boolean {
  return parseEmbed(input) !== null
}
