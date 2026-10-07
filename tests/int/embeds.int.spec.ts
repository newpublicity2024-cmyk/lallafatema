import { describe, it, expect } from 'vitest'

import {
  EMBED_FRAME_HOSTS,
  isEmbeddable,
  parseEmbed,
  type EmbedKind,
  type EmbedProvider,
  type ParsedEmbed,
} from '@/lib/embeds'

/**
 * The embed parser is the only thing standing between "an editor pasted a URL into a
 * rich-text field" and "an `src` attribute on a public page", so these specs are written as
 * a security suite rather than a happy-path suite: for every provider we assert the *shape*
 * of what comes out (origin hard-coded, id charset-clean, nothing reflected), and for every
 * hostile class we assert `null` — never "sanitised but accepted".
 */

/** Charset every id must satisfy, asserted independently of the module's own regex. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/

/** Characters that must never survive into an emitted URL, whatever the input looked like. */
const DANGEROUS = ['<', '>', '"', "'", '`', ' ', '\\', '\n', '\t']

type Expectation = {
  url: string
  provider: EmbedProvider
  kind: EmbedKind
  id: string
  embedSrc: string
  canonicalUrl: string
}

/**
 * One row per URL shape we claim to support. Asserting the exact `embedSrc` and
 * `canonicalUrl` (not just "contains the id") is deliberate: it pins the hard-coded origins,
 * so a typo that pointed an iframe somewhere else would fail here rather than at runtime.
 */
const SUPPORTED: Expectation[] = [
  // ---- YouTube: one id space, five share-sheet shapes -----------------------------------
  {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://youtu.be/dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://www.youtube.com/live/dQw4w9WgXcQ',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=42',
    provider: 'youtube',
    kind: 'video',
    id: 'dQw4w9WgXcQ',
    embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },

  // ---- Vimeo ---------------------------------------------------------------------------
  {
    url: 'https://vimeo.com/76979871',
    provider: 'vimeo',
    kind: 'video',
    id: '76979871',
    embedSrc: 'https://player.vimeo.com/video/76979871',
    canonicalUrl: 'https://vimeo.com/76979871',
  },
  {
    url: 'https://player.vimeo.com/video/76979871',
    provider: 'vimeo',
    kind: 'video',
    id: '76979871',
    embedSrc: 'https://player.vimeo.com/video/76979871',
    canonicalUrl: 'https://vimeo.com/76979871',
  },
  {
    url: 'https://vimeo.com/channels/staffpicks/76979871',
    provider: 'vimeo',
    kind: 'video',
    id: '76979871',
    embedSrc: 'https://player.vimeo.com/video/76979871',
    canonicalUrl: 'https://vimeo.com/76979871',
  },
  {
    url: 'https://vimeo.com/groups/motion/videos/76979871',
    provider: 'vimeo',
    kind: 'video',
    id: '76979871',
    embedSrc: 'https://player.vimeo.com/video/76979871',
    canonicalUrl: 'https://vimeo.com/76979871',
  },

  // ---- Dailymotion ---------------------------------------------------------------------
  {
    url: 'https://www.dailymotion.com/video/x7tgad0',
    provider: 'dailymotion',
    kind: 'video',
    id: 'x7tgad0',
    embedSrc: 'https://www.dailymotion.com/embed/video/x7tgad0',
    canonicalUrl: 'https://www.dailymotion.com/video/x7tgad0',
  },
  {
    url: 'https://dai.ly/x7tgad0',
    provider: 'dailymotion',
    kind: 'video',
    id: 'x7tgad0',
    embedSrc: 'https://www.dailymotion.com/embed/video/x7tgad0',
    canonicalUrl: 'https://www.dailymotion.com/video/x7tgad0',
  },
  {
    url: 'https://www.dailymotion.com/embed/video/x7tgad0',
    provider: 'dailymotion',
    kind: 'video',
    id: 'x7tgad0',
    embedSrc: 'https://www.dailymotion.com/embed/video/x7tgad0',
    canonicalUrl: 'https://www.dailymotion.com/video/x7tgad0',
  },

  // ---- Facebook: three kinds, all rendered through plugins/*.php ------------------------
  {
    url: 'https://www.facebook.com/watch/?v=1234567890',
    provider: 'facebook',
    kind: 'video',
    id: '1234567890',
    embedSrc:
      'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1234567890&show_text=false',
    canonicalUrl: 'https://www.facebook.com/watch/?v=1234567890',
  },
  {
    url: 'https://www.facebook.com/lallafatema/videos/1234567890',
    provider: 'facebook',
    kind: 'video',
    id: '1234567890',
    embedSrc:
      'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1234567890&show_text=false',
    canonicalUrl: 'https://www.facebook.com/watch/?v=1234567890',
  },
  {
    url: 'https://www.facebook.com/reel/1234567890',
    provider: 'facebook',
    kind: 'reel',
    id: '1234567890',
    embedSrc:
      'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1234567890&show_text=false',
    canonicalUrl: 'https://www.facebook.com/reel/1234567890',
  },
  {
    url: 'https://www.facebook.com/someuser/posts/1234567890',
    provider: 'facebook',
    kind: 'post',
    id: '1234567890',
    embedSrc:
      'https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fsomeuser%2Fposts%2F1234567890&show_text=true',
    canonicalUrl: 'https://www.facebook.com/someuser/posts/1234567890',
  },
  {
    url: 'https://web.facebook.com/Some-Page-Name-1234/posts/9876543210',
    provider: 'facebook',
    kind: 'post',
    id: '9876543210',
    embedSrc:
      'https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2FSome-Page-Name-1234%2Fposts%2F9876543210&show_text=true',
    canonicalUrl: 'https://www.facebook.com/Some-Page-Name-1234/posts/9876543210',
  },

  // ---- Instagram -----------------------------------------------------------------------
  {
    url: 'https://www.instagram.com/p/CxAbCdEfGhI/',
    provider: 'instagram',
    kind: 'post',
    id: 'CxAbCdEfGhI',
    embedSrc: 'https://www.instagram.com/p/CxAbCdEfGhI/embed',
    canonicalUrl: 'https://www.instagram.com/p/CxAbCdEfGhI/',
  },
  {
    url: 'https://www.instagram.com/reel/CxAbCdEfGhI/',
    provider: 'instagram',
    kind: 'reel',
    id: 'CxAbCdEfGhI',
    embedSrc: 'https://www.instagram.com/reel/CxAbCdEfGhI/embed',
    canonicalUrl: 'https://www.instagram.com/reel/CxAbCdEfGhI/',
  },
  {
    url: 'https://instagram.com/reels/CxAbCdEfGhI/',
    provider: 'instagram',
    kind: 'reel',
    id: 'CxAbCdEfGhI',
    embedSrc: 'https://www.instagram.com/reel/CxAbCdEfGhI/embed',
    canonicalUrl: 'https://www.instagram.com/reel/CxAbCdEfGhI/',
  },
  {
    url: 'https://www.instagram.com/tv/CxAbCdEfGhI/',
    provider: 'instagram',
    kind: 'post',
    id: 'CxAbCdEfGhI',
    embedSrc: 'https://www.instagram.com/p/CxAbCdEfGhI/embed',
    canonicalUrl: 'https://www.instagram.com/p/CxAbCdEfGhI/',
  },

  // ---- TikTok --------------------------------------------------------------------------
  {
    url: 'https://www.tiktok.com/@someuser/video/7212345678901234567',
    provider: 'tiktok',
    kind: 'video',
    id: '7212345678901234567',
    embedSrc: 'https://www.tiktok.com/embed/v2/7212345678901234567',
    canonicalUrl: 'https://www.tiktok.com/@someuser/video/7212345678901234567',
  },
  {
    url: 'https://www.tiktok.com/@some.user_1/video/7212345678901234567?is_from_webapp=1',
    provider: 'tiktok',
    kind: 'video',
    id: '7212345678901234567',
    embedSrc: 'https://www.tiktok.com/embed/v2/7212345678901234567',
    canonicalUrl: 'https://www.tiktok.com/@some.user_1/video/7212345678901234567',
  },
]

describe('parseEmbed — supported providers and kinds', () => {
  it.each(SUPPORTED)('parses $url', (expected) => {
    const parsed = parseEmbed(expected.url)
    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject({
      provider: expected.provider,
      kind: expected.kind,
      id: expected.id,
      embedSrc: expected.embedSrc,
      canonicalUrl: expected.canonicalUrl,
    })
  })

  it('covers every provider in the union', () => {
    const providers = new Set(SUPPORTED.map((c) => c.provider))
    expect([...providers].sort()).toEqual([
      'dailymotion',
      'facebook',
      'instagram',
      'tiktok',
      'vimeo',
      'youtube',
    ])
  })

  it('covers every kind in the union', () => {
    const kinds = new Set(SUPPORTED.map((c) => c.kind))
    expect([...kinds].sort()).toEqual(['post', 'reel', 'video'])
  })

  it('distinguishes Facebook and Instagram reels from posts and videos', () => {
    expect(parseEmbed('https://www.facebook.com/reel/1234567890')?.kind).toBe('reel')
    expect(parseEmbed('https://www.facebook.com/watch/?v=1234567890')?.kind).toBe('video')
    expect(parseEmbed('https://www.facebook.com/someuser/posts/1234567890')?.kind).toBe('post')
    expect(parseEmbed('https://www.instagram.com/reel/CxAbCdEfGhI/')?.kind).toBe('reel')
    expect(parseEmbed('https://www.instagram.com/p/CxAbCdEfGhI/')?.kind).toBe('post')
  })

  it('ignores tracking and timestamp query noise rather than failing on it', () => {
    const bare = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    const noisy = parseEmbed(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4&utm_source=whatsapp',
    )
    expect(noisy).toEqual(bare)
  })

  it('accepts surrounding whitespace, as a paste from a share sheet often carries', () => {
    expect(parseEmbed('  https://vimeo.com/76979871\n')).toEqual(parseEmbed('https://vimeo.com/76979871'))
  })

  it('accepts a mixed-case host, which the URL parser lowercases', () => {
    expect(parseEmbed('https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ')).toEqual(
      parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    )
  })
})

describe('parseEmbed — privacy and consent posture', () => {
  it('routes YouTube through youtube-nocookie, never youtube.com', () => {
    for (const row of SUPPORTED.filter((c) => c.provider === 'youtube')) {
      const parsed = parseEmbed(row.url)
      expect(parsed?.embedSrc.startsWith('https://www.youtube-nocookie.com/')).toBe(true)
    }
  })

  it('marks every provider click-to-load — all six set third-party state on load', () => {
    for (const row of SUPPORTED) {
      expect(parseEmbed(row.url)?.requiresClickToLoad).toBe(true)
    }
  })

  it('exposes a key-free thumbnail for YouTube and Dailymotion', () => {
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ')?.thumbnailUrl).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
    expect(parseEmbed('https://dai.ly/x7tgad0')?.thumbnailUrl).toBe(
      'https://www.dailymotion.com/thumbnail/video/x7tgad0',
    )
  })

  it('returns null thumbnails where the provider needs an API key, rather than guessing', () => {
    for (const url of [
      'https://vimeo.com/76979871',
      'https://www.facebook.com/reel/1234567890',
      'https://www.instagram.com/p/CxAbCdEfGhI/',
      'https://www.tiktok.com/@someuser/video/7212345678901234567',
    ]) {
      expect(parseEmbed(url)?.thumbnailUrl).toBeNull()
    }
  })

  it('drops the Vimeo unlisted-video hash instead of leaking it into public HTML', () => {
    const parsed = parseEmbed('https://vimeo.com/76979871/abcdef1234')
    expect(parsed?.id).toBe('76979871')
    expect(parsed?.embedSrc).not.toContain('abcdef1234')
    expect(parsed?.canonicalUrl).not.toContain('abcdef1234')
  })
})

describe('parseEmbed — output is rebuilt, never reflected', () => {
  it.each(SUPPORTED)('rebuilds rather than echoing $url', ({ url }) => {
    const parsed = parseEmbed(url) as ParsedEmbed

    // The emitted src depends on NOTHING but the provider and the validated id: rebuilding
    // from our own canonical URL must land on the identical string. (Asserting `!== url`
    // would be wrong here — three of these rows paste an embed URL, so equality is correct
    // for them; "a pasted watch URL is never echoed" is asserted separately below.)
    expect(parsed.embedSrc).toBe((parseEmbed(parsed.canonicalUrl) as ParsedEmbed).embedSrc)
    expect(parsed.embedSrc.startsWith('https://')).toBe(true)
    expect(parsed.canonicalUrl.startsWith('https://')).toBe(true)

    // The id is the only input-derived value, and it is charset-clean.
    expect(parsed.id).toMatch(SAFE_ID)

    // The src origin is one we have declared to the CSP.
    expect(EMBED_FRAME_HOSTS).toContain(new URL(parsed.embedSrc).origin)

    for (const char of DANGEROUS) {
      expect(parsed.embedSrc).not.toContain(char)
      expect(parsed.canonicalUrl).not.toContain(char)
      expect(parsed.thumbnailUrl ?? '').not.toContain(char)
    }
  })

  it('never echoes a pasted watch / share URL back as the iframe src', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ', // youtube.com, not the nocookie host
      'https://vimeo.com/76979871',
      'https://www.dailymotion.com/video/x7tgad0',
      'https://dai.ly/x7tgad0',
      'https://www.facebook.com/watch/?v=1234567890',
      'https://www.facebook.com/reel/1234567890',
      'https://www.facebook.com/someuser/posts/1234567890',
      'https://www.instagram.com/p/CxAbCdEfGhI/',
      'https://www.instagram.com/reel/CxAbCdEfGhI/',
      'https://www.tiktok.com/@someuser/video/7212345678901234567',
    ]) {
      expect((parseEmbed(url) as ParsedEmbed).embedSrc).not.toBe(url)
    }
  })

  it('emits a canonical URL that parses back to the same embed (round trip)', () => {
    for (const { url } of SUPPORTED) {
      const first = parseEmbed(url) as ParsedEmbed
      const second = parseEmbed(first.canonicalUrl)
      expect(second, `canonicalUrl of ${url} did not re-parse`).not.toBeNull()
      expect(second).toEqual(first)
    }
  })

  it('is idempotent on its own YouTube embed src', () => {
    const first = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ') as ParsedEmbed
    expect(parseEmbed(first.embedSrc)).toEqual(first)
  })

  it('keeps the Facebook plugin href pointed at a rebuilt facebook.com permalink', () => {
    const parsed = parseEmbed('https://www.facebook.com/someuser/posts/1234567890') as ParsedEmbed
    const href = new URL(parsed.embedSrc).searchParams.get('href')
    expect(href).toBe('https://www.facebook.com/someuser/posts/1234567890')
    expect(href).toBe(parsed.canonicalUrl)
  })

  it('encodes the Facebook href so it cannot smuggle extra plugin parameters', () => {
    // The watch permalink itself contains `?v=`, so an unencoded href would split into two
    // query parameters and let anything after it set plugin options.
    for (const url of [
      'https://www.facebook.com/watch/?v=1234567890',
      'https://www.facebook.com/reel/1234567890',
      'https://www.facebook.com/someuser/posts/1234567890',
    ]) {
      const parsed = parseEmbed(url) as ParsedEmbed
      const params = new URL(parsed.embedSrc)
      expect([...params.searchParams.keys()]).toEqual(['href', 'show_text'])
      // Exactly one literal `?` in the whole src: the plugin's own query separator. The
      // permalink's `?` and `=` are encoded inside the href value.
      expect(parsed.embedSrc.indexOf('?')).toBe(parsed.embedSrc.lastIndexOf('?'))
    }

    const watch = parseEmbed('https://www.facebook.com/watch/?v=1234567890') as ParsedEmbed
    expect(watch.canonicalUrl).toContain('?v=1234567890')
    expect(watch.embedSrc).toContain('%3Fv%3D1234567890')
  })
})

describe('parseEmbed — URL-parser quirks that must not become bypasses', () => {
  it('stays safe when the URL parser strips tabs and newlines from the input', () => {
    // Per the URL spec, ASCII tab/newline are removed before parsing, so these resolve to a
    // genuine provider host. That is fine precisely because the id is still charset-checked
    // and the origin is hard-coded — assert the outcome so the behaviour is intentional.
    expect(parseEmbed('https://www.yout\nube.com/watch?v=dQw4w9WgXcQ')).toEqual(
      parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    )
    expect(parseEmbed('https://www.youtube.com/watch?v=dQw4\tw9WgXcQ')).toEqual(
      parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    )
  })

  it('refuses an IP-literal or loopback host', () => {
    expect(parseEmbed('https://127.0.0.1/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseEmbed('https://[::1]/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseEmbed('https://localhost/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('refuses a percent-encoded route segment, so an encoded path cannot match a route', () => {
    expect(parseEmbed('https://www.youtube.com/%77atch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseEmbed('https://www.instagram.com/%70/CxAbCdEfGhI/')).toBeNull()
  })

  it('refuses a Facebook actor that is a dot run or a reserved route', () => {
    expect(parseEmbed('https://www.facebook.com/a..b/posts/1234567890')).toBeNull()
    expect(parseEmbed('https://www.facebook.com/plugins/posts/1234567890')).toBeNull()
    expect(parseEmbed('https://www.facebook.com/profile.php/posts/1234567890')).toBeNull()
  })

  it('refuses a Vimeo channel / group URL that carries no video id', () => {
    // `channels/<name>` with a numeric name must not be read as a video id.
    expect(parseEmbed('https://vimeo.com/channels/staffpicks')).toBeNull()
    expect(parseEmbed('https://vimeo.com/channels/1234')).toBeNull()
    expect(parseEmbed('https://vimeo.com/groups/motion')).toBeNull()
    // …but the full wrapper shapes still resolve.
    expect(parseEmbed('https://vimeo.com/channels/staffpicks/76979871')?.id).toBe('76979871')
    expect(parseEmbed('https://vimeo.com/groups/motion/videos/76979871')?.id).toBe('76979871')
  })

  it('drops the fragment rather than carrying it into the src', () => {
    const parsed = parseEmbed('https://vimeo.com/76979871#t=10s') as ParsedEmbed
    expect(parsed.embedSrc).toBe('https://player.vimeo.com/video/76979871')
  })
})

/* -------------------------------------------------------------------------- */
/* Hostile input                                                              */
/* -------------------------------------------------------------------------- */

describe('parseEmbed — non-https schemes are refused, never upgraded', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'javascript:void(0)//https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank',
    'blob:https://www.youtube.com/0000',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'HTTP://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '//www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https:www.youtube.com/watch?v=dQw4w9WgXcQ',
  ])('refuses %s', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })
})

describe('parseEmbed — userinfo in the authority is refused', () => {
  it.each([
    'https://user@evil.tld@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com@evil.tld/watch?v=dQw4w9WgXcQ',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://user@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://:pass@vimeo.com/76979871',
  ])('refuses %s', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })

  it('is not fooled by the URL spec reading userinfo up to the LAST @', () => {
    // `new URL` resolves this hostname to www.youtube.com, so a host check alone passes it.
    const url = new URL('https://user@evil.tld@www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(url.hostname).toBe('www.youtube.com')
    expect(parseEmbed(url.href)).toBeNull()
  })
})

describe('parseEmbed — host matching is exact or on a dot boundary', () => {
  it.each([
    'https://youtube.com.evil.tld/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com.evil.tld/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.co/watch?v=dQw4w9WgXcQ',
    'https://evil.tld/www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://evil.tld/?u=https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://xn--youtube-ucb.com/watch?v=dQw4w9WgXcQ',
    'https://notvimeo.com/76979871',
    'https://vimeo.com.evil.tld/76979871',
    'https://notinstagram.com/p/CxAbCdEfGhI/',
    'https://facebook.com.evil.tld/reel/1234567890',
    'https://tiktok.com.evil.tld/@u/video/7212345678901234567',
    'https://notdailymotion.com/video/x7tgad0',
  ])('refuses %s', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })

  it('accepts genuine provider subdomains', () => {
    expect(parseEmbed('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.provider).toBe('youtube')
    expect(parseEmbed('https://music.youtube.com/watch?v=dQw4w9WgXcQ')?.provider).toBe('youtube')
    expect(parseEmbed('https://player.vimeo.com/video/76979871')?.provider).toBe('vimeo')
    expect(parseEmbed('https://web.facebook.com/reel/1234567890')?.provider).toBe('facebook')
  })

  it('refuses an explicit port — no provider is served off 443', () => {
    expect(parseEmbed('https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseEmbed('https://vimeo.com:3000/76979871')).toBeNull()
  })

  it('treats a trailing root dot as the same host, since the emitted origin is fixed', () => {
    expect(parseEmbed('https://www.youtube.com./watch?v=dQw4w9WgXcQ')).toEqual(
      parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    )
  })
})

describe('parseEmbed — id injection is refused, not sanitised', () => {
  it.each([
    'https://www.youtube.com/watch?v=" onload="alert(1)',
    'https://www.youtube.com/watch?v=../../etc/passwd',
    'https://www.youtube.com/watch?v=abc%22%3E%3Cscript%3E',
    'https://www.youtube.com/watch?v=abc>def',
    'https://www.youtube.com/watch?v=abc def',
    'https://www.youtube.com/shorts/abc%22%3E',
    'https://youtu.be/abc%22onload%3D%22x',
    'https://vimeo.com/76979871"><script>alert(1)</script>',
    'https://vimeo.com/not-a-number',
    'https://www.dailymotion.com/video/x7tgad0%22%3E',
    'https://www.facebook.com/watch/?v=abc',
    'https://www.facebook.com/reel/abc',
    'https://www.facebook.com/some%20user/posts/1234567890',
    'https://www.facebook.com/someuser/posts/abc',
    'https://www.instagram.com/p/CxAbCd%22%3E/',
    'https://www.tiktok.com/@u/video/<img src=x onerror=alert(1)>',
    'https://www.tiktok.com/@u/video/abc',
    'https://www.tiktok.com/@bad%20user/video/7212345678901234567',
  ])('refuses %s', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })

  it('refuses an over-long id rather than emitting it', () => {
    expect(parseEmbed(`https://youtu.be/${'a'.repeat(65)}`)).toBeNull()
    expect(parseEmbed(`https://vimeo.com/${'1'.repeat(33)}`)).toBeNull()
  })

  it('refuses an input longer than the parse bound', () => {
    expect(parseEmbed(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${'a'.repeat(2100)}`)).toBeNull()
  })
})

describe('parseEmbed — structurally invalid input', () => {
  it.each([
    '',
    '   ',
    '\n\t ',
    'not a url at all',
    'https://',
    'https:///watch?v=dQw4w9WgXcQ',
    'www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://www.youtube.com',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://www.youtube.com/shorts/',
    'https://www.youtube.com/feed/subscriptions',
    'https://youtu.be/',
    'https://vimeo.com/',
    'https://vimeo.com/channels/staffpicks',
    'https://www.dailymotion.com/',
    'https://www.dailymotion.com/video/',
    'https://dai.ly/',
    'https://www.facebook.com/',
    'https://www.facebook.com/watch/',
    'https://www.facebook.com/reel/',
    'https://www.facebook.com/someuser',
    'https://www.facebook.com/plugins/posts/1234567890',
    'https://www.instagram.com/',
    'https://www.instagram.com/p/',
    'https://www.instagram.com/someuser/',
    'https://www.tiktok.com/',
    'https://www.tiktok.com/@someuser',
    'https://www.tiktok.com/@someuser/video/',
    'https://www.tiktok.com/video/7212345678901234567',
  ])('refuses %j', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })

  it('never throws on non-string input', () => {
    const inputs = [undefined, null, 0, 42, {}, [], true, Symbol('x')]
    for (const value of inputs) {
      expect(() => parseEmbed(value as unknown as string)).not.toThrow()
      expect(parseEmbed(value as unknown as string)).toBeNull()
      expect(isEmbeddable(value as unknown as string)).toBe(false)
    }
  })
})

describe('parseEmbed — unsupported providers are refused, never guessed', () => {
  it.each([
    'https://twitter.com/jack/status/20',
    'https://x.com/jack/status/20',
    'https://mobile.twitter.com/jack/status/20',
    'https://www.threads.net/@someone/post/ABC',
    'https://www.linkedin.com/posts/someone_activity-123',
    'https://soundcloud.com/artist/track',
    'https://open.spotify.com/track/abc',
    'https://rumble.com/v1abcd-title.html',
    'https://www.twitch.tv/videos/123456',
    'https://snapchat.com/t/abcdef',
    'https://t.me/channel/123',
    'https://www.pinterest.com/pin/123456789/',
    // Short links whose code only the provider can expand: refusing beats a dead iframe.
    'https://fb.watch/abcdefg/',
    'https://vm.tiktok.com/ZMabcdefg/',
    'https://vt.tiktok.com/ZSabcdefg/',
  ])('refuses %s', (input) => {
    expect(parseEmbed(input)).toBeNull()
    expect(isEmbeddable(input)).toBe(false)
  })
})

describe('isEmbeddable', () => {
  it('agrees with parseEmbed on every supported URL', () => {
    for (const { url } of SUPPORTED) {
      expect(isEmbeddable(url)).toBe(true)
      expect(parseEmbed(url)).not.toBeNull()
    }
  })

  it('is exactly the non-null predicate of parseEmbed', () => {
    const corpus = [
      ...SUPPORTED.map((c) => c.url),
      'https://twitter.com/jack/status/20',
      'javascript:alert(1)',
      '',
      'https://www.youtube.com/watch',
    ]
    for (const url of corpus) {
      expect(isEmbeddable(url)).toBe(parseEmbed(url) !== null)
    }
  })
})

describe('EMBED_FRAME_HOSTS', () => {
  it('is a non-empty list of bare https origins', () => {
    expect(EMBED_FRAME_HOSTS.length).toBeGreaterThan(0)
    for (const origin of EMBED_FRAME_HOSTS) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/)
      expect(new URL(origin).origin).toBe(origin)
    }
  })

  it('has no duplicates', () => {
    expect(new Set(EMBED_FRAME_HOSTS).size).toBe(EMBED_FRAME_HOSTS.length)
  })

  it('covers every origin the parser can emit, and nothing more', () => {
    const emitted = new Set(
      SUPPORTED.map((c) => new URL((parseEmbed(c.url) as ParsedEmbed).embedSrc).origin),
    )
    expect([...emitted].sort()).toEqual([...EMBED_FRAME_HOSTS].sort())
  })
})
