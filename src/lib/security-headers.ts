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
  // Google's ad-traffic-quality script (sodar), loaded by GPT alongside every ad request.
  'https://*.adtrafficquality.google',
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
/**
 * Frames Google Ad Manager (GPT, components/GamSlot.tsx) opens. Each was observed blocked
 * in a real browser before it was added — none is a guess:
 *   - SafeFrame: Ad Manager serves third-party and programmatic creatives inside a
 *     cross-origin frame on a random `<hash>.safeframe.googlesyndication.com` host.
 *     Without it the slot reports "filled" and stays blank, which no log records.
 *   - `*.doubleclick.net`: cookie matching (`cm.g.doubleclick.net`) and GPT's own frames.
 *   - `*.adtrafficquality.google`: the runner frame the sodar script above opens.
 *   - `www.google.com`: the invisible reCAPTCHA frame (`/recaptcha/api2/aframe`) that the
 *     same invalid-traffic check loads.
 */
const GAM_FRAMES = [
  'https://*.safeframe.googlesyndication.com',
  'https://*.doubleclick.net',
  'https://*.adtrafficquality.google',
  'https://www.google.com',
]
// Social/video embed origins the rich-text embed parser can produce. MUST stay identical to
// EMBED_FRAME_HOSTS in src/lib/embeds.ts — mirrored rather than imported because this module
// is pulled in by next.config.ts through an extensionless relative import and has to remain
// dependency-free; tests/int/security-headers.int.spec.ts asserts the two lists match, so the
// duplication fails loudly instead of rotting into a silently blank iframe in production.
// (www.youtube-nocookie.com is already covered by YOUTUBE above and is not repeated here.)
const EMBED_FRAMES = [
  'https://player.vimeo.com',
  'https://www.dailymotion.com',
  'https://www.facebook.com',
  'https://www.instagram.com',
  'https://www.tiktok.com',
]

export function buildCsp(): string {
  const devEval = process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"]
  const scriptSrc = ["'self'", "'unsafe-inline'", ...devEval, ...GOOGLE, ...ONESIGNAL, ...YOUTUBE]
  const frameSrc = ["'self'", ...YOUTUBE, ...ADSENSE_FRAMES, ...GAM_FRAMES, ...ONESIGNAL, ...EMBED_FRAMES]

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
    /**
     * Audio/video sources for `<video>` and `<audio>`.
     *
     * WITHOUT THIS DIRECTIVE THE SELF-HOSTED VIDEO BLOCK IS DEAD IN PRODUCTION. `media-src`
     * has no default of its own — it falls back to `default-src`, which is `'self'` — so a
     * `<video>` whose file lives on the Vercel Blob host is refused by the browser before a
     * byte is requested. Nothing in the markup looks wrong, no server log records it, and
     * every unit test that renders the element still passes: the only symptom is a player
     * that will not play, in production, for readers.
     *
     * `https:` rather than the storage hostname for the same reason `img-src` is already
     * `https:`: the host is environment-derived (the Blob store id, or `R2_PUBLIC_URL`, or a
     * Cloudflare zone) and a literal here would be a static header that silently stops
     * matching the day storage moves. What may be STORED is controlled where it belongs —
     * `lib/upload-guard.ts` decides which types and sizes can ever become a media document,
     * and `safeMediaSrc` in the renderer refuses anything that is not a plain https URL or a
     * site-relative path.
     *
     * `blob:` covers a preview the admin builds from a local file before upload.
     */
    ['media-src', ["'self'", 'blob:', 'data:', 'https:']],
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
