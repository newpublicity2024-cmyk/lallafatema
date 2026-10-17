import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  LALLA_FATEMA_CHANNEL_ID,
  channelFeedUrl,
  formatDuration,
  parseChannelFeed,
  parseChannelId,
  parseIsoDuration,
  resolvedChannelId,
  videoUrls,
} from '@/lib/youtube'

/**
 * The channel-feed parser, exercised against a REAL captured feed from the Lalla Fatema
 * channel (`tests/int/fixtures/youtube-channel-feed.xml`, fetched 2026-10-15).
 *
 * Written as a security suite as much as a parsing suite, for the same reason
 * `embeds.int.spec.ts` is: every string in this feed — titles, descriptions, thumbnail
 * URLs — is chosen by whoever uploads the video, and all of it ends up in rendered HTML on
 * the magazine's homepage. So alongside "does it read the feed", these assert the *shape*
 * of what comes out: ids charset-clean, every URL rebuilt from a hard-coded origin,
 * nothing reflected from the input.
 *
 * EXPECTED COUNTS ARE MEASURED, NOT WRITTEN DOWN. The fixture is scanned independently
 * below with throwaway regexes and the parser is compared against that. Hard-coding "15
 * entries, 9 shorts" would make the test agree with a number from the brief rather than
 * with the file, and it would have to be edited every time the fixture is refreshed.
 */

const FIXTURE = path.join(process.cwd(), 'tests/int/fixtures/youtube-channel-feed.xml')
const xml = readFileSync(FIXTURE, 'utf8')

/** Independent read of the fixture — deliberately not using the module under test. */
function scanFixture() {
  const ids: string[] = []
  const shorts: string[] = []
  for (const block of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([A-Za-z0-9_-]+)<\/yt:videoId>/.exec(block)?.[1]
    if (!id) continue
    ids.push(id)
    const href = /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/.exec(block)?.[1] ?? ''
    if (href.includes('/shorts/')) shorts.push(id)
  }
  return { ids, shorts }
}

const measured = scanFixture()

describe('parseChannelFeed — against a real captured channel feed', () => {
  const videos = parseChannelFeed(xml)

  it('reads every entry in the feed', () => {
    expect(measured.ids.length).toBeGreaterThan(0)
    expect(videos).toHaveLength(measured.ids.length)
    expect(new Set(videos.map((v) => v.videoId))).toEqual(new Set(measured.ids))
  })

  it('classifies exactly the Shorts that the feed marks as Shorts', () => {
    // The fixture must contain both kinds, or this assertion proves nothing.
    expect(measured.shorts.length).toBeGreaterThan(0)
    expect(measured.shorts.length).toBeLessThan(measured.ids.length)

    const flagged = videos.filter((v) => v.isShort).map((v) => v.videoId)
    expect(new Set(flagged)).toEqual(new Set(measured.shorts))
  })

  it('returns videos newest first', () => {
    const times = videos.map((v) => new Date(v.publishedAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('decodes XML entities in Arabic titles instead of leaking markup', () => {
    // The captured feed contains `&quot;` inside a title; the parser must resolve it.
    expect(xml).toContain('&quot;')
    const withQuotes = videos.filter((v) => v.title.includes('"'))
    expect(withQuotes.length).toBeGreaterThan(0)
    for (const video of videos) {
      expect(video.title).not.toMatch(/&(quot|amp|lt|gt|apos|#\d+);/)
    }
  })

  it('gives every video a non-empty title and a valid ISO publish date', () => {
    for (const video of videos) {
      expect(video.title.trim()).not.toBe('')
      expect(Number.isNaN(new Date(video.publishedAt).getTime())).toBe(false)
      expect(video.publishedAt).toBe(new Date(video.publishedAt).toISOString())
    }
  })

  it('rebuilds every thumbnail from the id rather than trusting the feed URL', () => {
    // The feed serves posters from rotating hosts (i2/i3/i4.ytimg.com). We ignore those
    // and emit one canonical shape, so a hostile `media:thumbnail` can never reach an src.
    expect(xml).toMatch(/i\d\.ytimg\.com/)
    for (const video of videos) {
      expect(video.thumbnailUrl).toBe(`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`)
    }
  })

  it('reads view counts when the feed carries them', () => {
    const withViews = videos.filter((v) => typeof v.views === 'number')
    expect(withViews.length).toBeGreaterThan(0)
    for (const video of withViews) {
      expect(video.views).toBeGreaterThanOrEqual(0)
    }
  })

  it('reports no duration — RSS does not carry one', () => {
    for (const video of videos) expect(video.durationSeconds).toBeNull()
  })

  it('never emits an id outside the safe charset', () => {
    for (const video of videos) expect(video.videoId).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('parseChannelFeed — malformed and hostile input', () => {
  const cases: [string, string][] = [
    ['empty string', ''],
    ['plain text', 'hello'],
    ['json', '{"entries":[]}'],
    ['truncated', '<?xml version="1.0"?><feed><entry><yt:videoId>abc'],
    ['no entries', '<?xml version="1.0"?><feed></feed>'],
  ]

  it.each(cases)('returns [] for %s', (_label, input) => {
    expect(parseChannelFeed(input)).toEqual([])
  })

  it('returns [] rather than throwing for non-string input', () => {
    expect(parseChannelFeed(undefined)).toEqual([])
    expect(parseChannelFeed(null)).toEqual([])
    expect(parseChannelFeed(42)).toEqual([])
    expect(parseChannelFeed({})).toEqual([])
  })

  it('does not expand a declared external entity', () => {
    const attack =
      '<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      '<feed><entry><yt:videoId>&xxe;</yt:videoId><title>t</title>' +
      '<published>2026-01-01T00:00:00+00:00</published></entry></feed>'
    // `&xxe;` is not one of the five predefined entities, so it stays literal text and the
    // id then fails the charset check — the entry is dropped rather than resolved.
    expect(parseChannelFeed(attack)).toEqual([])
  })

  it('drops an entry whose id is not in the safe charset', () => {
    const hostile =
      '<feed><entry><yt:videoId>../../etc/passwd</yt:videoId><title>t</title>' +
      '<published>2026-01-01T00:00:00+00:00</published></entry></feed>'
    expect(parseChannelFeed(hostile)).toEqual([])
  })

  it('drops an entry with no usable publish date', () => {
    const undated =
      '<feed><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>t</title>' +
      '<published>not a date</published></entry></feed>'
    expect(parseChannelFeed(undated)).toEqual([])
  })

  it('ignores a duplicated entry rather than storing it twice', () => {
    const entry =
      '<entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>t</title>' +
      '<link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>' +
      '<published>2026-01-01T00:00:00+00:00</published></entry>'
    expect(parseChannelFeed(`<feed>${entry}${entry}</feed>`)).toHaveLength(1)
  })

  it('strips control characters from a title', () => {
    const nasty =
      '<feed><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>ok\u0007\u0000bad</title>' +
      '<link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>' +
      '<published>2026-01-01T00:00:00+00:00</published></entry></feed>'
    const [video] = parseChannelFeed(nasty)
    expect(video.title).toBe('okbad')
  })
})

describe('parseChannelId', () => {
  it('accepts a bare channel id', () => {
    expect(parseChannelId(LALLA_FATEMA_CHANNEL_ID)).toBe(LALLA_FATEMA_CHANNEL_ID)
  })

  it('accepts an https channel URL', () => {
    expect(parseChannelId(`https://www.youtube.com/channel/${LALLA_FATEMA_CHANNEL_ID}`)).toBe(
      LALLA_FATEMA_CHANNEL_ID,
    )
  })

  it.each([
    ['empty', ''],
    ['handle (needs a network lookup)', 'https://www.youtube.com/@lallafatema'],
    ['legacy vanity path', 'https://www.youtube.com/c/LallafatimaNetOfficiel'],
    ['http, not https', `http://www.youtube.com/channel/${LALLA_FATEMA_CHANNEL_ID}`],
    ['lookalike host', `https://youtube.com.evil.tld/channel/${LALLA_FATEMA_CHANNEL_ID}`],
    ['userinfo smuggling', `https://evil.tld@www.youtube.com/channel/${LALLA_FATEMA_CHANNEL_ID}`],
    ['explicit port', `https://www.youtube.com:8443/channel/${LALLA_FATEMA_CHANNEL_ID}`],
    ['traversal', 'UC../../etc/passwd'],
    ['too short', 'UCabc'],
    ['markup', `${LALLA_FATEMA_CHANNEL_ID}<script>`],
  ])('rejects %s', (_label, input) => {
    expect(parseChannelId(input)).toBeNull()
  })

  it('defaults to the Lalla Fatema channel when the override is absent or malformed', () => {
    const original = process.env.YOUTUBE_CHANNEL_ID
    try {
      delete process.env.YOUTUBE_CHANNEL_ID
      expect(resolvedChannelId()).toBe(LALLA_FATEMA_CHANNEL_ID)

      process.env.YOUTUBE_CHANNEL_ID = 'nonsense'
      expect(resolvedChannelId()).toBe(LALLA_FATEMA_CHANNEL_ID)

      process.env.YOUTUBE_CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'
      expect(resolvedChannelId()).toBe('UCaaaaaaaaaaaaaaaaaaaaaa')
    } finally {
      if (original === undefined) delete process.env.YOUTUBE_CHANNEL_ID
      else process.env.YOUTUBE_CHANNEL_ID = original
    }
  })

  it('builds the feed URL from the validated id and refuses an invalid one', () => {
    expect(channelFeedUrl(LALLA_FATEMA_CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${LALLA_FATEMA_CHANNEL_ID}`,
    )
    expect(() => channelFeedUrl('../../etc')).toThrow()
  })
})

describe('videoUrls', () => {
  it('emits the nocookie embed origin the CSP allowlists', () => {
    const urls = videoUrls('dQw4w9WgXcQ')
    expect(urls).toEqual({
      watchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    })
  })

  it('refuses an id outside the safe charset', () => {
    for (const bad of ['', '../x', 'a b', 'a"b', 'x'.repeat(100)]) {
      expect(videoUrls(bad)).toBeNull()
    }
  })
})

describe('duration helpers', () => {
  it.each([
    ['PT4M32S', 272],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['PT2M', 120],
    ['P1DT1H', 90000],
  ])('parses %s', (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected)
  })

  it.each([['PT'], [''], ['4M32S'], ['nonsense'], ['P1D']])('rejects %s', (input) => {
    expect(parseIsoDuration(input)).toBeNull()
  })

  it('formats seconds for display', () => {
    expect(formatDuration(272)).toBe('4:32')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(null)).toBeNull()
  })
})
