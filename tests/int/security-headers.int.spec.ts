import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  buildCsp,
  cspHeader,
  securityHeaders,
  CSP_REPORT_ONLY,
} from '@/lib/security-headers'
import { EMBED_FRAME_HOSTS, parseEmbed } from '@/lib/embeds'

/** Pull one directive's source list out of a serialised CSP. */
const directive = (csp: string, name: string): string[] => {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
  return found ? found.slice(name.length).trim().split(/\s+/).filter(Boolean) : []
}

/** Does a frame-src entry (exact or `https://*.suffix`) cover this origin? */
const covers = (entry: string, origin: string): boolean => {
  if (entry === origin) return true
  if (!entry.startsWith('https://*.')) return false
  const suffix = entry.slice('https://*.'.length)
  const host = new URL(origin).hostname
  return host === suffix || host.endsWith(`.${suffix}`)
}

describe('buildCsp', () => {
  const csp = buildCsp()

  it('hard-locks the high-value directives', () => {
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it('allows inline scripts and the known third-party script hosts', () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain('https://pagead2.googlesyndication.com')
    expect(csp).toContain('https://cdn.onesignal.com')
    expect(csp).toContain('https://www.youtube.com')
  })

  it('never uses a nonce (would break ISR)', () => {
    expect(csp).not.toContain('nonce-')
  })
})

describe('buildCsp unsafe-eval branch (NODE_ENV-dependent)', () => {
  // vi.stubEnv is type-safe (process.env.NODE_ENV is read-only in @types/node)
  // and restores every stubbed var so no other suite is affected.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("omits 'unsafe-eval' in production", () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(buildCsp()).not.toContain("'unsafe-eval'")
  })

  it("includes 'unsafe-eval' outside production (dev HMR / React-refresh)", () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(buildCsp()).toContain("'unsafe-eval'")
  })
})

describe('securityHeaders', () => {
  const headers = securityHeaders()
  const byKey = (k: string) => headers.find((h) => h.key === k)?.value

  it('sets HSTS, SAMEORIGIN framing, nosniff, referrer and permissions policy', () => {
    expect(byKey('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains')
    expect(byKey('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(byKey('X-Content-Type-Options')).toBe('nosniff')
    expect(byKey('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(byKey('Permissions-Policy')).toContain('geolocation=()')
  })

  it('emits the CSP under the name matching the rollout flag', () => {
    const expectedKey = CSP_REPORT_ONLY
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy'
    expect(cspHeader().key).toBe(expectedKey)
    expect(byKey(expectedKey)).toBe(buildCsp())
  })
})

describe('buildCsp frame-src — social/video embed providers', () => {
  const frameSrc = directive(buildCsp(), 'frame-src')

  it("still frames only 'self' plus explicit https origins", () => {
    expect(frameSrc[0]).toBe("'self'")
    for (const entry of frameSrc.slice(1)) {
      expect(entry).toMatch(/^https:\/\/(\*\.)?[a-z0-9.-]+$/)
    }
  })

  it('allows every origin the embed parser can emit', () => {
    for (const origin of EMBED_FRAME_HOSTS) {
      expect(
        frameSrc.some((entry) => covers(entry, origin)),
        `frame-src does not cover ${origin}`,
      ).toBe(true)
    }
  })

  it('names each provider embed origin explicitly', () => {
    expect(frameSrc).toContain('https://www.youtube-nocookie.com')
    expect(frameSrc).toContain('https://player.vimeo.com')
    expect(frameSrc).toContain('https://www.dailymotion.com')
    expect(frameSrc).toContain('https://www.facebook.com')
    expect(frameSrc).toContain('https://www.instagram.com')
    expect(frameSrc).toContain('https://www.tiktok.com')
  })

  it('keeps the pre-existing AdSense and OneSignal frame origins', () => {
    expect(frameSrc).toContain('https://googleads.g.doubleclick.net')
    expect(frameSrc).toContain('https://tpc.googlesyndication.com')
    expect(frameSrc).toContain('https://www.youtube.com')
    expect(frameSrc).toContain('https://cdn.onesignal.com')
    expect(frameSrc).toContain('https://*.onesignal.com')
  })

  it('does not frame a provider the parser rejects', () => {
    // If the parser will never emit it, the CSP must not pre-authorise it.
    for (const origin of [
      'https://twitter.com',
      'https://x.com',
      'https://platform.twitter.com',
      'https://open.spotify.com',
      'https://player.twitch.tv',
    ]) {
      expect(frameSrc.some((entry) => covers(entry, origin))).toBe(false)
    }
  })

  it('carries no frame-src entry that is not reachable from a real parsed embed', () => {
    // Guards against padding the embed allowlist: every embed origin added here must be
    // produced by an actual URL the parser accepts. (Ad/push origins are exempt — they are
    // framed by third-party scripts, not by the embed parser.)
    const thirdParty = new Set([
      "'self'",
      'https://www.youtube.com',
      'https://s.ytimg.com',
      'https://googleads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://cdn.onesignal.com',
      'https://*.onesignal.com',
    ])
    const samples = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/76979871',
      'https://www.dailymotion.com/video/x7tgad0',
      'https://www.facebook.com/watch/?v=1234567890',
      'https://www.instagram.com/p/CxAbCdEfGhI/',
      'https://www.tiktok.com/@someuser/video/7212345678901234567',
    ]
    const emitted = new Set(
      samples.map((url) => new URL(parseEmbed(url)!.embedSrc).origin),
    )
    for (const entry of frameSrc) {
      if (thirdParty.has(entry)) continue
      expect(emitted.has(entry), `${entry} is in frame-src but no embed uses it`).toBe(true)
    }
  })

  it('has no duplicate frame-src entries', () => {
    expect(new Set(frameSrc).size).toBe(frameSrc.length)
  })
})

describe('buildCsp — directives unaffected by the embed widening', () => {
  const csp = buildCsp()

  it('does not widen script-src to the embed providers', () => {
    const scriptSrc = directive(csp, 'script-src')
    for (const origin of ['https://www.facebook.com', 'https://www.instagram.com', 'https://www.tiktok.com']) {
      expect(scriptSrc).not.toContain(origin)
    }
  })

  it('keeps frame-ancestors locked to self (we are not embeddable ourselves)', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'self'"])
  })
})
