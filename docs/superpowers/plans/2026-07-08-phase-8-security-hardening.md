# Phase 8.2 — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add security response headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy), an explicit login lockout, a real CSRF/CORS/cookie posture, upload sanitization (block SVG + size caps), and an RBAC audit — with no schema change and no new runtime dependency.

**Architecture:** Header values live in pure, dependency-free modules (`src/lib/security-headers.ts`, `src/lib/origins.ts`, `src/lib/upload-guard.ts`) that are unit-testable and single-source the allowlists. `next.config.ts` emits the static headers for every route (ISR untouched — no per-request nonce). Payload config gains `csrf`/`cors`/`cookiePrefix`/`upload` limits; `Users.auth` becomes explicit; `Media` gets a `beforeValidate` guard + a raster/PDF `mimeTypes` allowlist. CSP ships **Report-Only**, is observed against the real public + admin flows, then flipped to enforce.

**Tech Stack:** Payload CMS 3.85, Next.js 16 App Router, TypeScript, Vitest (integration/unit), Playwright (E2E).

## Global Constraints

- **No schema change, no migration, no new runtime dependency.** All changes are config + pure helpers.
- **ISR must stay intact.** No per-request nonce; headers are static via `next.config.ts`. After changes, the homepage must still build `○ (Static)` and the site must serve `0 /_next/image` requests.
- **Live preview must keep working.** Framing headers are `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` — never `DENY`/`'none'` (the admin iframes `/preview` same-origin).
- **CSP posture:** host-allowlist + `'unsafe-inline'` in `script-src` (a nonce/hash would break ISR and Next's inline scripts). `'unsafe-eval'` is included **only when `NODE_ENV !== 'production'`** (Next.js HMR). Ship as `Content-Security-Policy-Report-Only`; flip to `Content-Security-Policy` only in Task 8 after observation.
- **No app-level rate limiter.** Payload 3 has no `rateLimit` config (Express dropped) — account lockout (`maxLoginAttempts`/`lockTime`) is the only in-app control; distributed rate-limiting is Cloudflare WAF at cutover (out of scope).
- **Arabic, RTL.** User-facing copy (upload rejection messages) is Arabic.
- **Tooling:** run pnpm via `npx pnpm@10.18.0` (PATH pnpm is too old). Unit/integration: `npx pnpm@10.18.0 run test:int` (vitest). E2E: `npx pnpm@10.18.0 run test:e2e` (Playwright — **needs a dev server on :3000**: `npx pnpm@10.18.0 dev`). Full verify: `npx pnpm@10.18.0 exec tsc --noEmit` + `npx pnpm@10.18.0 run lint` + `npx pnpm@10.18.0 run build`.

## File Structure

- `src/lib/origins.ts` (create) — `allowedOrigins()` pure helper (CSRF/CORS allowlist).
- `src/lib/security-headers.ts` (create) — `securityHeaders()`, `buildCsp()`, `cspHeader()`, `CSP_REPORT_ONLY`. Pure; imported by `next.config.ts` (relative) and tests (`@/`).
- `src/lib/upload-guard.ts` (create) — `ALLOWED_UPLOAD_MIME_TYPES`, `validateUpload()` pure helper.
- `next.config.ts` (modify) — add `async headers()`.
- `src/payload.config.ts` (modify) — add `cookiePrefix`, `csrf`, `cors`, top-level `upload` limits.
- `src/collections/Users.ts` (modify) — expand `auth: true` → explicit auth object.
- `src/collections/Media.ts` (modify) — `mimeTypes` from the shared allowlist + a `beforeValidate` guard.
- `docs/superpowers/notes/2026-07-08-rbac-audit.md` (create) — RBAC audit note.
- `tests/int/origins.int.spec.ts` (create) — `allowedOrigins`.
- `tests/int/security-headers.int.spec.ts` (create) — header + CSP builders.
- `tests/int/upload-guard.int.spec.ts` (create) — `validateUpload`.
- `tests/int/media-upload.int.spec.ts` (create) — SVG rejected through Payload (wiring proof).
- `tests/int/fixtures/evil.svg` (create) — SVG fixture with a script.
- `tests/int/rbac.int.spec.ts` (create) — anonymous cannot read users.
- `tests/e2e/security.e2e.spec.ts` (create) — response headers present; extended in Task 8 for enforce.

---

### Task 1: Origin allowlist (`allowedOrigins`)

**Files:**
- Create: `src/lib/origins.ts`
- Test: `tests/int/origins.int.spec.ts`

**Interfaces:**
- Produces: `allowedOrigins(): string[]` — the canonical origin plus `NEXT_PUBLIC_SERVER_URL` (trailing slash stripped), deduped, never `'*'`.

- [ ] **Step 1: Write the failing test**

Create `tests/int/origins.int.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'

import { allowedOrigins } from '@/lib/origins'

const ORIGINAL = process.env.NEXT_PUBLIC_SERVER_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = ORIGINAL
})

describe('allowedOrigins', () => {
  it('always includes the canonical origin and never a wildcard', () => {
    delete process.env.NEXT_PUBLIC_SERVER_URL
    const origins = allowedOrigins()
    expect(origins).toContain('https://lallafatema.ma')
    expect(origins).not.toContain('*')
  })

  it('adds NEXT_PUBLIC_SERVER_URL with trailing slash stripped, no duplicates', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000/'
    const origins = allowedOrigins()
    expect(origins).toContain('http://localhost:3000')
    expect(origins.filter((o) => o === 'http://localhost:3000')).toHaveLength(1)
  })

  it('does not duplicate the canonical origin when env equals it', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://lallafatema.ma'
    expect(allowedOrigins().filter((o) => o === 'https://lallafatema.ma')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int -- origins`
Expected: FAIL — cannot resolve `@/lib/origins`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/origins.ts`:

```ts
/**
 * Origins Payload trusts for CSRF and CORS — the canonical production URL plus whatever
 * NEXT_PUBLIC_SERVER_URL points at (localhost in dev, a preview URL in previews). Never
 * '*'. Deduped, trailing slashes stripped. Pure (reads only process.env).
 */
const CANONICAL_ORIGIN = 'https://lallafatema.ma'

export function allowedOrigins(): string[] {
  const origins = new Set<string>([CANONICAL_ORIGIN])
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim()
  if (envUrl) origins.add(envUrl.replace(/\/+$/, ''))
  return [...origins]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int -- origins`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/origins.ts tests/int/origins.int.spec.ts
git commit -m "feat(security): allowedOrigins helper for CSRF/CORS allowlist"
```

---

### Task 2: Security-headers module (`securityHeaders`, `buildCsp`)

**Files:**
- Create: `src/lib/security-headers.ts`
- Test: `tests/int/security-headers.int.spec.ts`

**Interfaces:**
- Produces:
  - `CSP_REPORT_ONLY: boolean` — `true` during rollout; flipped to `false` in Task 8.
  - `buildCsp(): string` — the full CSP policy string.
  - `cspHeader(): { key: string; value: string }` — CSP under the report-only or enforced name per `CSP_REPORT_ONLY`.
  - `securityHeaders(): { key: string; value: string }[]` — all response headers (non-CSP + CSP), shaped for Next.js `headers()`.

- [ ] **Step 1: Write the failing test**

Create `tests/int/security-headers.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int -- security-headers`
Expected: FAIL — cannot resolve `@/lib/security-headers`.

- [ ] **Step 3: Implement the module**

Create `src/lib/security-headers.ts`:

```ts
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
export const CSP_REPORT_ONLY = true

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int -- security-headers`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/security-headers.ts tests/int/security-headers.int.spec.ts
git commit -m "feat(security): security-headers module (CSP + hardening headers, report-only)"
```

---

### Task 3: Wire headers into `next.config.ts`

**Files:**
- Modify: `next.config.ts`
- Test: `tests/e2e/security.e2e.spec.ts` (create)

**Interfaces:**
- Consumes: `securityHeaders()` from `src/lib/security-headers.ts`.

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/security.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('security headers', () => {
  test('public responses carry the hardening headers and CSP', async ({ page }) => {
    const res = await page.goto(BASE)
    expect(res).not.toBeNull()
    const h = res!.headers()

    expect(h['strict-transport-security']).toContain('max-age=63072000')
    expect(h['x-frame-options']).toBe('SAMEORIGIN')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy']).toContain('geolocation=()')

    // Report-Only during rollout; Task 8 flips this to `content-security-policy`.
    const csp = h['content-security-policy-report-only'] ?? h['content-security-policy']
    expect(csp).toBeTruthy()
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Start the dev server (`npx pnpm@10.18.0 dev`), then run: `npx pnpm@10.18.0 run test:e2e -- security`
Expected: FAIL — the header assertions fail (no headers set yet).

- [ ] **Step 3: Add `headers()` to `next.config.ts`**

Add the import at the top (after the existing imports) and the `headers()` method inside `nextConfig`:

```ts
import { securityHeaders } from './src/lib/security-headers'
```

```ts
const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}
```

(Leave the rest of the file — the `withPayload` export — unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Restart the dev server so the new `next.config.ts` is loaded, then run: `npx pnpm@10.18.0 run test:e2e -- security`
Expected: PASS.

- [ ] **Step 5: Verify ISR is intact**

Run: `npx pnpm@10.18.0 run build`
Expected: build succeeds; the homepage `/` is still marked `○ (Static)` in the route table (headers do not force dynamic rendering).

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/e2e/security.e2e.spec.ts
git commit -m "feat(security): emit hardening headers + report-only CSP from next.config"
```

---

### Task 4: CSRF / CORS / cookie prefix + auth lockout

**Files:**
- Modify: `src/payload.config.ts`
- Modify: `src/collections/Users.ts`

**Interfaces:**
- Consumes: `allowedOrigins()` from `src/lib/origins.ts`.

- [ ] **Step 1: Add CSRF/CORS/cookiePrefix to `payload.config.ts`**

Add the import (after the existing collection/global imports):

```ts
import { allowedOrigins } from './lib/origins'
```

In the `buildConfig({ ... })` object, add these keys right after `secret: process.env.PAYLOAD_SECRET || '',`:

```ts
  // CSRF: only these origins may send Payload auth cookies (empty default = no origin check).
  csrf: allowedOrigins(),
  // CORS: same allowlist — never '*'.
  cors: allowedOrigins(),
  // Namespace auth cookies.
  cookiePrefix: 'lf',
```

- [ ] **Step 2: Make `Users.auth` explicit with lockout + cookie options**

In `src/collections/Users.ts`, replace `auth: true,` with:

```ts
  auth: {
    // Account lockout after repeated failures (the in-app anti-brute-force control;
    // distributed rate-limiting is Cloudflare WAF at cutover). These are Payload's
    // defaults made explicit + a shorter session.
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
    tokenExpiration: 7200, // 2 hours
    cookies: {
      sameSite: 'Lax',
      // Secure only in production so local http dev still sets the cookie.
      secure: process.env.NODE_ENV === 'production',
      // HttpOnly is always on in Payload — not configurable here, stated for the record.
    },
  },
```

- [ ] **Step 3: Verify typecheck + existing integration tests still pass**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.
Run: `npx pnpm@10.18.0 run test:int -- api`
Expected: PASS (the existing `fetches users` test still works — `getPayload` boots with the new config).

- [ ] **Step 4: Verify login still works and lockout is active (manual)**

Start the dev server, open `/admin`, and confirm you can log in with the dev admin (`dev@lallafatema.ma` / `DevAdmin!2026`). Then log out and attempt 6 logins with a wrong password: the 6th must report the account is locked.
Expected: normal login works; the account locks after 5 failed attempts.

- [ ] **Step 5: Commit**

```bash
git add src/payload.config.ts src/collections/Users.ts
git commit -m "feat(security): CSRF/CORS allowlist, cookie prefix, explicit auth lockout"
```

---

### Task 5: Upload-guard module (`validateUpload`)

**Files:**
- Create: `src/lib/upload-guard.ts`
- Test: `tests/int/upload-guard.int.spec.ts`

**Interfaces:**
- Produces:
  - `ALLOWED_UPLOAD_MIME_TYPES: readonly string[]` — raster image types + `application/pdf` (no SVG).
  - `validateUpload(file: { mimeType?: string | null; size?: number | null }): true | string` — `true` when acceptable, else an Arabic rejection message.

- [ ] **Step 1: Write the failing test**

Create `tests/int/upload-guard.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { validateUpload, ALLOWED_UPLOAD_MIME_TYPES } from '@/lib/upload-guard'

describe('validateUpload', () => {
  it('accepts a normal JPEG', () => {
    expect(validateUpload({ mimeType: 'image/jpeg', size: 2 * 1024 * 1024 })).toBe(true)
  })

  it('rejects SVG (stored-XSS vector)', () => {
    expect(validateUpload({ mimeType: 'image/svg+xml', size: 1000 })).toContain('غير مسموح')
  })

  it('rejects an unknown type', () => {
    expect(validateUpload({ mimeType: 'text/html', size: 10 })).toContain('غير مسموح')
  })

  it('rejects an image over 10MB', () => {
    expect(validateUpload({ mimeType: 'image/png', size: 11 * 1024 * 1024 })).toContain('الحد الأقصى')
  })

  it('accepts a PDF up to 25MB and rejects over', () => {
    expect(validateUpload({ mimeType: 'application/pdf', size: 24 * 1024 * 1024 })).toBe(true)
    expect(validateUpload({ mimeType: 'application/pdf', size: 26 * 1024 * 1024 })).toContain('الحد الأقصى')
  })

  it('exposes an allowlist without SVG but with PDF', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('image/svg+xml')
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('application/pdf')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int -- upload-guard`
Expected: FAIL — cannot resolve `@/lib/upload-guard`.

- [ ] **Step 3: Implement the module**

Create `src/lib/upload-guard.ts`:

```ts
/**
 * Upload validation for the Media collection: an allowlist of raster image types + PDF
 * (SVG deliberately excluded — it can carry <script> and become stored XSS), with per-type
 * size caps. Pure so it is unit-testable without a DB or HTTP layer; wired into Media via a
 * beforeValidate hook, and backstopped by a global busboy fileSize limit in payload.config.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
] as const

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB

/**
 * Returns `true` when the file is acceptable, or an Arabic error message describing why it
 * was rejected. Callers throw when a string comes back.
 */
export function validateUpload(file: { mimeType?: string | null; size?: number | null }): true | string {
  const mimeType = file.mimeType ?? ''
  const size = file.size ?? 0

  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'نوع الملف غير مسموح به. الأنواع المقبولة: JPEG، PNG، WebP، AVIF، GIF، وPDF.'
  }

  const cap = mimeType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (size > cap) {
    const mb = Math.floor(cap / (1024 * 1024))
    return `حجم الملف يتجاوز الحد الأقصى المسموح به (${mb} ميغابايت).`
  }

  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int -- upload-guard`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/upload-guard.ts tests/int/upload-guard.int.spec.ts
git commit -m "feat(security): validateUpload guard (block SVG, per-type size caps)"
```

---

### Task 6: Wire the upload guard into Media + global size backstop

**Files:**
- Modify: `src/collections/Media.ts`
- Modify: `src/payload.config.ts`
- Create: `tests/int/fixtures/evil.svg`
- Test: `tests/int/media-upload.int.spec.ts`

**Interfaces:**
- Consumes: `ALLOWED_UPLOAD_MIME_TYPES`, `validateUpload` from `src/lib/upload-guard.ts`; `APIError` from `payload`.

- [ ] **Step 1: Create the SVG fixture**

Create `tests/int/fixtures/evil.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <script>window.__xss = true</script>
  <rect width="10" height="10" />
</svg>
```

- [ ] **Step 2: Write the failing wiring test**

Create `tests/int/media-upload.int.spec.ts`:

```ts
import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
let payload: Payload

describe('Media upload guard (wiring)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('rejects an SVG upload through Payload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'blocked' },
        filePath: path.resolve(dirname, 'fixtures/evil.svg'),
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int -- media-upload`
Expected: FAIL — the create currently succeeds (SVG is accepted via `image/*`), so `rejects.toThrow()` fails.

- [ ] **Step 4: Restrict `mimeTypes` and add the guard hook in `Media.ts`**

In `src/collections/Media.ts`, update the imports:

```ts
import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { anyone, isAdminOrEditor, isAuthenticated } from '../access'
import { ALLOWED_UPLOAD_MIME_TYPES, validateUpload } from '../lib/upload-guard'
```

Add a `hooks` block (place it right after the `access` block) and change `mimeTypes`:

```ts
  hooks: {
    beforeValidate: [
      ({ req }) => {
        const file = req.file
        // Metadata-only updates (e.g. editing alt text) carry no file — nothing to check.
        if (!file) return
        const result = validateUpload({ mimeType: file.type, size: file.size })
        if (result !== true) {
          throw new APIError(result, 400)
        }
      },
    ],
  },
  upload: {
    focalPoint: true,
    crop: false,
    // Was `image/*` (allowed SVG). Now an explicit raster + PDF allowlist (see upload-guard).
    mimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
  },
```

- [ ] **Step 5: Add the global busboy size backstop in `payload.config.ts`**

In `src/payload.config.ts`, add a top-level `upload` key inside `buildConfig({ ... })` (e.g. right after the `cookiePrefix: 'lf',` line from Task 4):

```ts
  // Global hard cap for all upload collections (busboy). Per-type caps live in the Media
  // guard; this is the outer backstop against oversized/DoS uploads.
  upload: {
    limits: { fileSize: 26_214_400 }, // 25 MB
    abortOnLimit: true,
  },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int -- media-upload`
Expected: PASS — the SVG create now rejects.

- [ ] **Step 7: Commit**

```bash
git add src/collections/Media.ts src/payload.config.ts tests/int/media-upload.int.spec.ts tests/int/fixtures/evil.svg
git commit -m "feat(security): block SVG uploads + enforce size caps on Media"
```

---

### Task 7: RBAC audit note + regression test

**Files:**
- Create: `docs/superpowers/notes/2026-07-08-rbac-audit.md`
- Test: `tests/int/rbac.int.spec.ts`

**Interfaces:** none (documentation + a standalone regression test).

- [ ] **Step 1: Write the failing regression test**

Create `tests/int/rbac.int.spec.ts`:

```ts
import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'

let payload: Payload

describe('RBAC', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('does not expose users to unauthenticated (anonymous) reads', async () => {
    // overrideAccess:false + no `user` => the `read: Boolean(user)` access returns false.
    const res = await payload.find({ collection: 'users', overrideAccess: false })
    expect(res.docs).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it passes (already-correct posture)**

Run: `npx pnpm@10.18.0 run test:int -- rbac`
Expected: PASS — `Users.read` already gates on `Boolean(user)`, so anonymous reads return 0 docs. (This test is a regression guard that locks the intended posture; it should pass immediately. If it FAILS, that is a real finding — investigate before proceeding.)

- [ ] **Step 3: Write the RBAC audit note**

Create `docs/superpowers/notes/2026-07-08-rbac-audit.md`:

```markdown
# RBAC Audit — Phase 8.2 (2026-07-08)

Access-control review of every collection/global. Verdict: the posture is sound;
no rewrite. One regression test added (`tests/int/rbac.int.spec.ts`).

| Collection/Global | create | read | update | delete | Verdict |
|---|---|---|---|---|---|
| Posts / Categories / Tags / Videos / MagazineIssues / Pages | role-gated | public (published) | role-gated | role-gated | OK |
| Ads | admin/editor | public (windowed via query) | admin/editor | admin/editor | OK |
| Redirects | admin/editor | public map only | admin/editor | admin/editor | OK |
| Media | authenticated | anyone | authenticated | admin/editor | OK — see note 1 |
| Users | admin | `Boolean(user)` | admin-or-self | admin | OK — see note 2 |
| Globals (Homepage/MainMenu/SiteSettings) | — | anyone/appropriate | admin | — | OK |

**Privilege escalation:** `Users.role` is field-level locked to admins
(`isAdminFieldLevel` on create+update) — a non-admin cannot grant themselves a role. Good.

**Note 1 — Media create/update = any authenticated user.** A journalist can edit/replace
any media. Acceptable for a small trusted editorial team; not tightened. Revisit if the
team grows or external contributors are added.

**Note 2 — Users.read = any authenticated user.** Any logged-in user can read all user
records (names, emails, bios). Needed so admin relationship pickers can list authors, and
acceptable for a small trusted team. Anonymous read is already blocked (regression test).
Tighten to self-or-editor+ only if warranted later.

**Deferred (tracked separately):** `reserved-slug-guard` — an editor could create a page
slug colliding with a static route (soft-404 in sitemap). Not an access issue; own follow-up.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-08-rbac-audit.md tests/int/rbac.int.spec.ts
git commit -m "docs(security): RBAC audit note + anonymous-read regression test"
```

---

### Task 8: Observe Report-Only, then flip CSP to enforce

**Files:**
- Modify: `src/lib/security-headers.ts` (flip `CSP_REPORT_ONLY`; possibly refine the allowlist)
- Modify: `tests/e2e/security.e2e.spec.ts` (add the enforce/no-violation test)

**Interfaces:** consumes everything above; this is the rollout gate.

- [ ] **Step 1: Observe violations under Report-Only (public + admin)**

With all prior tasks committed and the dev server running, write a throwaway observation: navigate the homepage, an article, `/magazine`, `/videos`, `/search`, and `/admin` (log in; open a post in live preview; open the Media create screen), capturing `page.on('console')`. Record every message containing `Refused to` or `violates the following Content Security Policy`.

Run the site through Playwright (or manually with devtools open) and collect the list.
Expected output: a concrete list of CSP violations (may be empty).

- [ ] **Step 2: Resolve violations**

For each violation:
- If it's a **legitimate** third-party host we already expect (Google/OneSignal/YouTube) that isn't yet allowlisted, add the host to the correct group in `src/lib/security-headers.ts` (`GOOGLE`/`ONESIGNAL`/`YOUTUBE`/`ADSENSE_FRAMES`) or the correct directive.
- If **`/admin` specifically** needs more than the public policy (e.g. `blob:` workers, or `'unsafe-eval'` in production), add an admin-only override: change the public source to `'/((?!admin).*)'` and add a second block `{ source: '/admin/:path*', headers: [...] }` with an `adminCsp`, keeping them mutually exclusive so no route gets two CSP headers. (Only do this if observation proves it necessary — otherwise keep the single policy.)
- Re-run Step 1 until the public + admin flows produce **zero** violations under Report-Only.

If Step 1 produced an empty list, make no code change here and proceed.

- [ ] **Step 3: Write the enforce test (still failing under Report-Only)**

Append to `tests/e2e/security.e2e.spec.ts`:

```ts
test.describe('CSP enforcement', () => {
  test('serves an enforced CSP with no violations on the homepage', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (
        !t.includes('[Report Only]') &&
        (t.includes('Refused to') || t.includes('violates the following Content Security Policy'))
      ) {
        violations.push(t)
      }
    })

    const res = await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Enforced header name (not report-only) once the flag is flipped.
    expect(res!.headers()['content-security-policy']).toBeTruthy()
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 4: Run the enforce test to verify it fails**

Run: `npx pnpm@10.18.0 run test:e2e -- security`
Expected: the new test FAILS — the header is still `content-security-policy-report-only` (flag not flipped yet).

- [ ] **Step 5: Flip to enforce**

In `src/lib/security-headers.ts`, change:

```ts
export const CSP_REPORT_ONLY = false
```

- [ ] **Step 6: Run the enforce test to verify it passes**

Restart the dev server (reload `next.config.ts`/module), then run: `npx pnpm@10.18.0 run test:e2e -- security`
Expected: PASS — enforced CSP present, zero violations. (The Task 2 unit test still passes: it checks the header name against the flag, which is now `Content-Security-Policy`.)

- [ ] **Step 7: Full verification loop**

Run each and confirm clean:
- `npx pnpm@10.18.0 exec tsc --noEmit` → no errors
- `npx pnpm@10.18.0 run lint` → no errors
- `npx pnpm@10.18.0 run build` → succeeds; homepage `/` still `○ (Static)` (ISR intact)
- `npx pnpm@10.18.0 run test:int` → all integration/unit specs pass
- `npx pnpm@10.18.0 run test:e2e` → all E2E specs pass
- Manually confirm `/admin` loads and **live preview renders** (framing guard), and that the site serves `0 /_next/image` requests (image rule intact).

- [ ] **Step 8: Commit**

```bash
git add src/lib/security-headers.ts tests/e2e/security.e2e.spec.ts
git commit -m "feat(security): enforce CSP after clean report-only pass"
```

---

## Self-Review

**Spec coverage:**
- §1 Security headers → Tasks 2, 3, 8 (build, wire, enforce). All six header families covered; `SAMEORIGIN`/`frame-ancestors 'self'` preserve live preview.
- §2 Login lockout → Task 4 (explicit `maxLoginAttempts`/`lockTime`/`tokenExpiration`); "no app-level rate limiter" honored (none added).
- §3 CSRF/cookies/CORS → Tasks 1, 4 (`allowedOrigins` → `csrf`/`cors`, `cookiePrefix`, cookie options).
- §4 Upload sanitization → Tasks 5, 6 (allowlist + guard + busboy backstop; SVG blocked).
- §5 RBAC audit → Task 7 (note + regression test).
- §6 Rollout & verification → Task 8 (Report-Only → observe → enforce → full verify).

**Placeholder scan:** No TBD/TODO. Task 8 Steps 1–2 are genuinely observational with a concrete decision rule and exact code for each branch — not a placeholder. Every code step shows complete code.

**Type consistency:** `securityHeaders()`/`cspHeader()`/`buildCsp()`/`CSP_REPORT_ONLY` names match between Task 2, its test, and the Task 3/8 consumers. `allowedOrigins()` matches between Task 1 and Task 4. `validateUpload`/`ALLOWED_UPLOAD_MIME_TYPES` match between Task 5 and Task 6. `req.file` is `File`, so `.type`/`.size` are correct. Next.js `headers()` uses `{ key, value }` — matches `securityHeaders()`.

**No schema change / no new dependency:** confirmed — only config + pure TS modules + tests.
