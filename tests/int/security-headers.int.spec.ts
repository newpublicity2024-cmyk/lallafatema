import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  buildCsp,
  cspHeader,
  securityHeaders,
  CSP_REPORT_ONLY,
} from '@/lib/security-headers'

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
