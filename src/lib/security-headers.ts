/**
 * Static security response headers + Content-Security-Policy, emitted from next.config.ts
 * `headers()`. Pure and dependency-free (reads only process.env) so it imports cleanly
 * both from next.config (relative path) and the test suite (@/ alias).
 *
 * CSP posture (docs/superpowers/specs/2026-07-08-phase-8-security-hardening-design.md):
 * host-allowlist + 'unsafe-inline' (a nonce would break ISR + the injected/third-party
 * scripts). 'unsafe-eval' is added in development only (Next.js HMR / React-refresh).
 */

// Flip to false to ENFORCE (Content-Security-Policy-Report-Only -> Content-Security-Policy).
export const CSP_REPORT_ONLY = false

// Third-party hosts allowed to load scripts / frames. Single source of truth.
const GOOGLE = [
  'https://pagead2.googlesyndication.com',
  'https://*.googlesyndication.com',
  'https://www.googletagmanager.com',
  'https://www.google.com',
  'https://www.gstatic.com',
  'https://*.googleadservices.com',
  'https://*.doubleclick.net',
]
const ONESIGNAL = ['https://cdn.onesignal.com', 'https://*.onesignal.com']
const YOUTUBE = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://s.ytimg.com',
]
const ADSENSE_FRAMES = [
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
]

export function buildCsp(): string {
  const devEval = process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"]
  const scriptSrc = ["'self'", "'unsafe-inline'", ...devEval, ...GOOGLE, ...ONESIGNAL, ...YOUTUBE]
  const frameSrc = ["'self'", ...YOUTUBE, ...ADSENSE_FRAMES, ...ONESIGNAL]

  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'self'"]],
    ['form-action', ["'self'"]],
    ['script-src', scriptSrc],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", 'https:']],
    ['frame-src', frameSrc],
  ]

  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}

export function cspHeader(): { key: string; value: string } {
  return {
    key: CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: buildCsp(),
  }
}

export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    cspHeader(),
  ]
}
