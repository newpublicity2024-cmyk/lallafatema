import {
  channelFeedUrl,
  parseChannelFeed,
  parseIsoDuration,
  resolvedChannelId,
  videoUrls,
  type ChannelVideo,
  type ChannelVideoSource,
} from '@/lib/youtube'

/**
 * Where the channel's videos come from — the only module here that touches the network.
 *
 * TWO SOURCES, ONE SHAPE. Both produce {@link ChannelVideo}, so nothing downstream knows
 * or cares which ran:
 *
 *   - **RSS (default, no credentials).** `youtube.com/feeds/videos.xml?channel_id=…` is
 *     public, unmetered and needs no Google Cloud project. It returns the latest 15
 *     uploads, which is more than the 5-item band needs, and it is the only source that
 *     states authoritatively whether a video is a Short.
 *   - **Data API v3 (`YOUTUBE_API_KEY`).** Walks the channel's uploads playlist, so it can
 *     reach the whole back catalogue, and it carries real durations.
 *
 * The API is used automatically when the key is present and RSS otherwise. That ordering
 * is the point of having both: the feature works the moment it deploys, and dropping a key
 * into Vercel later deepens it without a code change. If the API call fails for any reason
 * — bad key, exhausted quota, Google outage — the fetch falls back to RSS rather than
 * leaving the band empty, because a slightly shallower band beats no band.
 *
 * SHORTS. RSS says so directly (`/shorts/<id>` alternate link). The Data API does not
 * expose a Shorts flag at all, so the API path infers it from duration. That inference is
 * documented at {@link SHORTS_MAX_SECONDS} and is the weaker of the two signals — one more
 * reason RSS stays the default.
 */

/** Network budget for one call. A cron tick must not hang a serverless function. */
const TIMEOUT_MS = 10_000

/** Upper bound on videos pulled from the API, so a huge channel cannot run away with a cron tick. */
const API_MAX_VIDEOS = 200

/**
 * Duration at or below which an API-sourced video is treated as a Short.
 *
 * YouTube allows Shorts up to three minutes, but it publishes no flag, and classifying
 * every sub-three-minute video as a Short would hide genuine short interviews from the
 * band. 60 seconds is the conservative line: it catches the vertical clips the band is
 * meant to exclude and lets a borderline case through as an ordinary video. The RSS path
 * never uses this — it reads the real answer off the feed.
 */
const SHORTS_MAX_SECONDS = 60

export type FetchedChannel = {
  channelId: string
  videos: ChannelVideo[]
  source: ChannelVideoSource
  /** Set when the API was attempted and fell back to RSS. Surfaced by the sync endpoint. */
  warning?: string
}

type FetchOptions = {
  channelId?: string
  apiKey?: string
  /** Injected in tests so the suite never reaches the network. */
  fetchImpl?: typeof fetch
  max?: number
}

/** `fetch` with a timeout, returning null rather than throwing on any transport failure. */
async function get(
  url: string,
  fetchImpl: typeof fetch,
  accept: string,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      headers: { accept },
      signal: controller.signal,
      // Always a live read: this runs from a cron whose entire purpose is freshness.
      cache: 'no-store',
    })
    return response.ok ? response : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* -------------------------------------------------------------------------- */
/* RSS                                                                        */
/* -------------------------------------------------------------------------- */

async function fetchViaRss(
  channelId: string,
  fetchImpl: typeof fetch,
): Promise<ChannelVideo[] | null> {
  const response = await get(channelFeedUrl(channelId), fetchImpl, 'application/atom+xml')
  if (!response) return null
  const xml = await response.text().catch(() => null)
  return xml === null ? null : parseChannelFeed(xml)
}

/* -------------------------------------------------------------------------- */
/* Data API v3                                                                */
/* -------------------------------------------------------------------------- */

const API = 'https://www.googleapis.com/youtube/v3'

/** Shape-check an untrusted JSON body without pulling in a schema library. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

async function json(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  const response = await get(url, fetchImpl, 'application/json')
  if (!response) return null
  const body = await response.json().catch(() => null)
  return asRecord(body)
}

/** The uploads playlist id for a channel — every upload, oldest API call in the chain. */
async function uploadsPlaylistId(
  channelId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const body = await json(
    `${API}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`,
    fetchImpl,
  )
  const item = asRecord(asArray(body?.items)[0])
  const related = asRecord(asRecord(item?.contentDetails)?.relatedPlaylists)
  return str(related?.uploads)
}

/** Durations for up to 50 ids per call — the only way to tell a Short from a video here. */
async function durations(
  ids: string[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const body = await json(
      `${API}/videos?part=contentDetails&id=${batch.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(apiKey)}`,
      fetchImpl,
    )
    if (!body) continue
    for (const raw of asArray(body.items)) {
      const item = asRecord(raw)
      const id = str(item?.id)
      const seconds = parseIsoDuration(asRecord(item?.contentDetails)?.duration)
      if (id && seconds !== null) result.set(id, seconds)
    }
  }
  return result
}

async function fetchViaApi(
  channelId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  max: number,
): Promise<ChannelVideo[] | null> {
  const playlist = await uploadsPlaylistId(channelId, apiKey, fetchImpl)
  if (!playlist) return null

  const collected: { videoId: string; title: string; description: string | null; publishedAt: string }[] = []
  let pageToken: string | null = null

  do {
    const url =
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlist)}` +
      `&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const body = await json(url, fetchImpl)
    if (!body) return collected.length > 0 ? finalise(collected, new Map()) : null

    for (const raw of asArray(body.items)) {
      const snippet = asRecord(asRecord(raw)?.snippet)
      const videoId = str(asRecord(snippet?.resourceId)?.videoId)
      const title = str(snippet?.title)
      const publishedAt = str(snippet?.publishedAt)
      if (!videoId || !title || !publishedAt) continue
      // `videoUrls` is the same validation the RSS path applies, so an id that could not
      // become a safe URL never enters the pipeline from either source.
      if (!videoUrls(videoId)) continue
      const when = new Date(publishedAt)
      if (Number.isNaN(when.getTime())) continue
      collected.push({
        videoId,
        title,
        description: str(snippet?.description),
        publishedAt: when.toISOString(),
      })
    }

    pageToken = str(body.nextPageToken)
  } while (pageToken && collected.length < max)

  if (collected.length === 0) return null

  const trimmed = collected.slice(0, max)
  const byId = await durations(
    trimmed.map((v) => v.videoId),
    apiKey,
    fetchImpl,
  )
  return finalise(trimmed, byId)
}

function finalise(
  items: { videoId: string; title: string; description: string | null; publishedAt: string }[],
  byId: Map<string, number>,
): ChannelVideo[] {
  return items
    .map((item) => {
      const seconds = byId.get(item.videoId) ?? null
      // `videoUrls` already returned non-null during collection; re-derive rather than
      // carrying the URL through, so the poster has exactly one definition.
      const urls = videoUrls(item.videoId)
      return {
        videoId: item.videoId,
        title: item.title.slice(0, 300),
        description: item.description ? item.description.slice(0, 2000) : null,
        publishedAt: item.publishedAt,
        thumbnailUrl: urls?.thumbnailUrl ?? '',
        isShort: seconds !== null && seconds <= SHORTS_MAX_SECONDS,
        views: null,
        durationSeconds: seconds,
      }
    })
    .filter((v) => v.thumbnailUrl !== '')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The channel's videos, newest first.
 *
 * Never throws: every transport failure resolves to an empty `videos` array with the
 * attempted source recorded. The caller (the sync) treats an empty fetch as "change
 * nothing", which is the only safe reading — a network blip must not be mistaken for
 * "the channel deleted everything".
 */
export async function fetchChannelVideos(options: FetchOptions = {}): Promise<FetchedChannel> {
  const channelId = options.channelId ?? resolvedChannelId()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY
  const max = options.max ?? API_MAX_VIDEOS

  if (apiKey) {
    const viaApi = await fetchViaApi(channelId, apiKey, fetchImpl, max)
    if (viaApi && viaApi.length > 0) {
      return { channelId, videos: viaApi, source: 'api' }
    }
    const viaRss = await fetchViaRss(channelId, fetchImpl)
    return {
      channelId,
      videos: viaRss ?? [],
      source: 'rss',
      warning: 'the YouTube Data API returned nothing; fell back to the public RSS feed',
    }
  }

  const viaRss = await fetchViaRss(channelId, fetchImpl)
  return { channelId, videos: viaRss ?? [], source: 'rss' }
}
