import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { parseChannelFeed, type ChannelVideo } from '@/lib/youtube'
import { fetchChannelVideos } from '@/lib/youtube-source'
import { syncChannelVideos } from '@/lib/youtube-sync'
import { getChannelVideos, getLatestChannelVideos } from '@/lib/queries'

/**
 * The sync that keeps the homepage band current, and the queries that read it back.
 *
 * SHARED-DATABASE DISCIPLINE (the rule `tests/int/publish-due.int.spec.ts` establishes):
 * this Neon database is shared with production. Every row created here therefore
 *
 *   - carries a per-run id prefix, so concurrent runs cannot collide,
 *   - is attributed to a synthetic channel id, not the real one,
 *   - is dated in 2019, so it can never lead the band or reach a reader even if the
 *     homepage regenerated mid-test, and
 *   - is deleted in `afterAll`.
 *
 * Assertions are written as MEMBERSHIP over a wide query rather than position in the
 * top 5, because the real channel's rows live in the same table. "The Short is absent
 * from the first five results" would pass trivially once the table holds real data;
 * "the Short is absent from all 500" cannot.
 */

const CHANNEL = 'UCyyyTESTyyyTESTyyyTESTy'
const RUN = Date.now().toString(36).toUpperCase().slice(-5)
const vid = (n: number) => `YT${RUN}${String(n).padStart(4, '0')}`.slice(0, 11)

/** Dated in the past on purpose — see the shared-database note above. */
const fixture = (n: number, isShort: boolean, title: string): ChannelVideo => ({
  videoId: vid(n),
  title,
  description: `spec fixture ${RUN}`,
  publishedAt: new Date(Date.UTC(2019, 0, 1 + n)).toISOString(),
  thumbnailUrl: `https://img.youtube.com/vi/${vid(n)}/hqdefault.jpg`,
  isShort,
  views: 10 * n,
  durationSeconds: isShort ? 40 : 500,
})

const LANDSCAPE_A = fixture(1, false, 'فيديو أفقي أول')
const LANDSCAPE_B = fixture(2, false, 'فيديو أفقي ثان')
const SHORT = fixture(3, true, 'فيديو قصير')
const BATCH = [LANDSCAPE_A, LANDSCAPE_B, SHORT]

let payload: Payload

const findRow = async (videoId: string) => {
  const { docs } = await payload.find({
    collection: 'youtube-videos',
    where: { videoId: { equals: videoId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
}, 60000)

afterAll(async () => {
  for (const video of BATCH) {
    const row = await findRow(video.videoId).catch(() => null)
    if (row) {
      await payload
        .delete({ collection: 'youtube-videos', id: row.id, overrideAccess: true })
        .catch(() => {})
    }
  }
})

describe('syncChannelVideos', () => {
  it('creates a row for every video on the first run', async () => {
    const result = await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: BATCH,
      source: 'rss',
    })

    expect(result.fetched).toBe(3)
    expect(result.created).toBe(3)
    expect(result.updated).toBe(0)
    expect(result.changed).toBe(3)
    expect(result.channelId).toBe(CHANNEL)
  })

  it('stores the Shorts flag as the feed reported it', async () => {
    expect((await findRow(SHORT.videoId))?.isShort).toBe(true)
    expect((await findRow(LANDSCAPE_A.videoId))?.isShort).toBe(false)
  })

  it('is idempotent — an unchanged channel writes nothing and reports no change', async () => {
    const result = await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: BATCH,
      source: 'rss',
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.unchanged).toBe(3)
    // `changed === 0` is what stops the cron purging the ISR cache 48 times a day.
    expect(result.changed).toBe(0)

    const { totalDocs } = await payload.find({
      collection: 'youtube-videos',
      where: { channelId: { equals: CHANNEL } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    expect(totalDocs).toBe(3)
  })

  it('applies an upstream title change', async () => {
    const renamed = BATCH.map((v) =>
      v.videoId === LANDSCAPE_B.videoId ? { ...v, title: 'عنوان مُحدَّث' } : v,
    )
    const result = await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: renamed,
      source: 'rss',
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    expect((await findRow(LANDSCAPE_B.videoId))?.title).toBe('عنوان مُحدَّث')
  })

  it('never clears an editor’s hide override', async () => {
    const row = await findRow(LANDSCAPE_A.videoId)
    await payload.update({
      collection: 'youtube-videos',
      id: row!.id,
      data: { hidden: true },
      overrideAccess: true,
    })

    // Change the title at the same time, so this proves the sync still updates content
    // while leaving the editor-owned field alone — not that it skips known rows.
    await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: BATCH.map((v) =>
        v.videoId === LANDSCAPE_A.videoId ? { ...v, title: 'عنوان آخر' } : v,
      ),
      source: 'rss',
    })

    const after = await findRow(LANDSCAPE_A.videoId)
    expect(after?.hidden).toBe(true)
    expect(after?.title).toBe('عنوان آخر')
  })

  it('writes nothing when the source returned no videos', async () => {
    const result = await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: [],
      source: 'rss',
    })
    expect(result).toMatchObject({ fetched: 0, created: 0, updated: 0, changed: 0 })

    // A YouTube outage must not be read as "the channel deleted everything".
    const { totalDocs } = await payload.find({
      collection: 'youtube-videos',
      where: { channelId: { equals: CHANNEL } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    expect(totalDocs).toBe(3)
  })

  it('does not delete a video that has dropped out of the feed window', async () => {
    // The RSS feed is a 15-item window, so absence means "older than the window" far
    // more often than it means "deleted". Pruning on absence would wipe the archive.
    await syncChannelVideos({
      payload,
      channelId: CHANNEL,
      videos: [LANDSCAPE_B],
      source: 'rss',
    })
    expect(await findRow(SHORT.videoId)).not.toBeNull()
    expect(await findRow(LANDSCAPE_A.videoId)).not.toBeNull()
  })
})

describe('reader-facing queries', () => {
  it('never surfaces a Short', async () => {
    const { docs } = await getChannelVideos({ limit: 500 })
    const ids = docs.map((d) => d.videoId)
    expect(ids).toContain(LANDSCAPE_B.videoId)
    expect(ids).not.toContain(SHORT.videoId)
    for (const doc of docs) expect(doc.isShort).not.toBe(true)
  })

  it('never surfaces a hidden video', async () => {
    // LANDSCAPE_A was hidden by the override test above.
    const { docs } = await getChannelVideos({ limit: 500 })
    expect(docs.map((d) => d.videoId)).not.toContain(LANDSCAPE_A.videoId)
  })

  it('returns the band newest-first', async () => {
    const band = await getLatestChannelVideos(5)
    const times = band.map((v) => new Date(v.publishedAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(band.length).toBeLessThanOrEqual(5)
  })
})

describe('fetchChannelVideos', () => {
  const feedXml = readFileSync(
    path.join(process.cwd(), 'tests/int/fixtures/youtube-channel-feed.xml'),
    'utf8',
  )

  it('reads the channel over RSS when no API key is configured', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url))
      return new Response(feedXml, { status: 200 })
    }) as unknown as typeof fetch

    const result = await fetchChannelVideos({
      channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
      apiKey: undefined,
      fetchImpl,
    })

    expect(result.source).toBe('rss')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCgJShJYlHW79y-ETvEqTI9w',
    )
    expect(result.videos).toHaveLength(parseChannelFeed(feedXml).length)
  })

  it('resolves to an empty list instead of throwing when the network fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch

    const result = await fetchChannelVideos({
      channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
      apiKey: undefined,
      fetchImpl,
    })
    expect(result.videos).toEqual([])
    expect(result.source).toBe('rss')
  })

  it('resolves to an empty list on a non-ok response', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof fetch

    const result = await fetchChannelVideos({
      channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
      apiKey: undefined,
      fetchImpl,
    })
    expect(result.videos).toEqual([])
  })

  it('falls back to RSS when the Data API key is present but unusable', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url)
      seen.push(href)
      if (href.startsWith('https://www.googleapis.com/')) {
        return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 403 })
      }
      return new Response(feedXml, { status: 200 })
    }) as unknown as typeof fetch

    const result = await fetchChannelVideos({
      channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
      apiKey: 'a-key-that-does-not-work',
      fetchImpl,
    })

    expect(seen.some((u) => u.startsWith('https://www.googleapis.com/'))).toBe(true)
    expect(result.source).toBe('rss')
    expect(result.videos.length).toBeGreaterThan(0)
    expect(result.warning).toBeTruthy()
  })

  it('uses the Data API when a working key is present, and infers Shorts from duration', async () => {
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url)
      if (href.includes('/channels?')) {
        return new Response(
          JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUxyz' } } }] }),
          { status: 200 },
        )
      }
      if (href.includes('/playlistItems?')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                snippet: {
                  title: 'طويل',
                  description: 'وصف',
                  publishedAt: '2026-10-02T10:00:00Z',
                  resourceId: { videoId: 'dQw4w9WgXcQ' },
                },
              },
              {
                snippet: {
                  title: 'قصير',
                  description: '',
                  publishedAt: '2026-10-03T10:00:00Z',
                  resourceId: { videoId: 'aqz-KE-bpKQ' },
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (href.includes('/videos?')) {
        return new Response(
          JSON.stringify({
            items: [
              { id: 'dQw4w9WgXcQ', contentDetails: { duration: 'PT8M12S' } },
              { id: 'aqz-KE-bpKQ', contentDetails: { duration: 'PT30S' } },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch

    const result = await fetchChannelVideos({
      channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
      apiKey: 'working-key',
      fetchImpl,
    })

    expect(result.source).toBe('api')
    expect(result.videos).toHaveLength(2)
    // Newest first.
    expect(result.videos[0].videoId).toBe('aqz-KE-bpKQ')
    expect(result.videos[0].isShort).toBe(true)
    expect(result.videos[0].durationSeconds).toBe(30)
    expect(result.videos[1].isShort).toBe(false)
    expect(result.videos[1].durationSeconds).toBe(492)
    // Posters are rebuilt from the id on this path too.
    expect(result.videos[1].thumbnailUrl).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
  })
})
