# Phase 8.2 — Security Hardening (Design)

**Date:** 2026-07-08
**Status:** Approved (design), pending spec review
**Sub-project:** Phase 8 (hardening & launch), item #2 of 5

## Problem

The site ships with **no security response headers at all** — no CSP, HSTS,
X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy
(`next.config.ts` has no `headers()`). Payload's auth is bare (`auth: true`), so the
CSRF origin allowlist is empty, CORS is unset, and login lockout — while on by Payload
default — is invisible and untuned. `Media` accepts `image/*`, which includes **SVG**, a
stored-XSS vector if ever served inline, with no file-size cap. Launch should not happen
in this posture.

## Goal

A pragmatic pre-launch hardening pass across five areas — security headers, login
rate-limit/lockout, CSRF/cookie/CORS config, upload sanitization, and an RBAC audit —
delivered with **no database schema change** and **no new runtime dependency**, and
without regressing the site's static/ISR rendering or the admin live-preview.

## Scope

**In scope (5 areas):**
1. Security headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy)
2. Login rate-limit / account lockout (make Payload defaults explicit + tuned)
3. CSRF allowlist + explicit secure/HttpOnly cookies + CORS allowlist
4. Upload sanitization (block SVG + exotic types, add a size cap)
5. RBAC audit pass (document; tighten only real gaps)

**Out of scope / deferred (YAGNI or wrong phase):**
- **2FA** — Payload core has none; it's a real build (schema field + enrollment UI +
  login-flow change) and gets its own sub-project.
- **Cloudflare WAF / edge rate-limiting** — cutover-time (plan-acknowledged).
- **Nonce / `strict-dynamic` CSP** — incompatible with the site's static/ISR rendering
  (see Architecture §1). Rejected deliberately, not overlooked.
- **A `report-to` / `report-uri` violation collector** — no collector infra yet; the
  Report-Only rollout is QA'd via the browser console + Playwright console capture.
- Any deployment — deploy is deferred, work stays local.

## Design principles

- **Static headers, ISR-safe.** All headers are emitted from `next.config.ts`
  `async headers()` — no per-request work, so the statically-rendered pages the whole
  architecture protects (ISR; the client-cookie-read ConsentMode design exists precisely
  to keep pages `○ Static`) are untouched.
- **Single-sourced, testable.** Header values and the third-party host allowlist live in
  one pure module, `src/lib/security-headers.ts`, so they are unit-testable and there is
  one place to edit the allowlist.
- **Honest about limits.** Where a control is weak in this environment (serverless
  rate-limiting; `'unsafe-inline'` in `script-src`), the spec says so rather than implying
  protection it does not give.

## Architecture

### §1 — Security headers

New `src/lib/security-headers.ts` exports the static header list plus two CSP strings
(`publicCsp`, `adminCsp`). `next.config.ts` gains `async headers()` returning two blocks:
a global block (`source: '/:path*'`) and an admin override (`source: '/admin/:path*'`).

**Applied to all routes:**

| Header | Value | Rationale |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | 2y HTTPS pin. **No `preload`** initially — preload is hard to reverse; add post-launch once stable. Browsers ignore HSTS over http, so local dev is unaffected. |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking guard. **`SAMEORIGIN`, not `DENY`** — the admin live-preview iframes the frontend (`/preview`) same-origin; `DENY` would break it. |
| `X-Content-Type-Options` | `nosniff` | Stop MIME sniffing (defense-in-depth for the upload changes). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak full paths cross-origin. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Deny sensors we never use. Deliberately **does not** restrict `browsing-topics` so AdSense/Topics is unaffected. |

**Public CSP** (`publicCsp`), rolled out Report-Only first (see §6):

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
form-action 'self';
script-src 'self' 'unsafe-inline' <google-ads> <gtm> <gstatic> <doubleclick> <onesignal-cdn> <youtube>;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https:;
frame-src <youtube> <youtube-nocookie> <adsense-iframes> <onesignal>;
```

- `frame-ancestors 'self'` (not `'none'`) — again to preserve live-preview framing.
- **`'unsafe-inline'` in `script-src` is required and cannot be avoided here.** Adding any
  hash/nonce *disables* `'unsafe-inline'` per the CSP spec, which would break Next.js's own
  parser-inserted inline hydration scripts and the static `ConsentMode` script — and a
  nonce forces per-request rendering, killing ISR. The value still delivered: the host
  allowlist **blocks external-script injection** (`<script src=evil.com>`), and
  `object-src`/`base-uri`/`form-action`/`frame-ancestors` are hard-locked regardless.
- `img-src`/`connect-src` use a broad `https:` because ad/analytics pixels and beacons hit
  many hosts and images/beacons cannot execute; can be tightened later off Report-Only data.
- The exact host tokens (`<google-ads>` etc.) are enumerated in `security-headers.ts`; the
  known third parties in play are **Google AdSense/GTM** (`*.googlesyndication.com`,
  `pagead2.googlesyndication.com`, `www.googletagmanager.com`, `www.google.com`,
  `www.gstatic.com`, `*.googleadservices.com`, `*.doubleclick.net`,
  `googleads.g.doubleclick.net`, `tpc.googlesyndication.com`), **OneSignal**
  (`cdn.onesignal.com`, `*.onesignal.com`), and **YouTube** (`www.youtube.com`,
  `www.youtube-nocookie.com`, `s.ytimg.com`). Self-hosted fonts (next/font) need no
  external font origin. Meilisearch is server-side only (no browser origin).

**Admin CSP** (`adminCsp`, `source: '/admin/:path*'`): the public policy plus whatever the
Payload admin bundle needs — expected `'unsafe-eval'` in `script-src` and `blob:` for
workers (`worker-src blob:` / `child-src blob:`). The exact additions are **confirmed
empirically during the Report-Only pass** (drive `/admin` and read console violations)
before enforce. Keeping this separate means the public site stays tighter than the admin.

### §2 — Login rate-limit / account lockout

Make Payload's implicit auth defaults **explicit and tuned** in `Users` (currently bare
`auth: true`):

```ts
auth: {
  maxLoginAttempts: 5,      // lock the account after 5 failed logins
  lockTime: 600 * 1000,     // 10-minute lockout
  tokenExpiration: 7200,    // 2h session (explicit)
  // cookies: see §3
}
```

Top-level Payload config gains `rateLimit: { max, window, trustProxy: true }` (`trustProxy`
so the per-IP key is the real client behind Vercel/Cloudflare, not the proxy).

**Honest caveat (documented in code + spec):** Payload's built-in rate limiter is
in-memory, so on Vercel serverless it is **per-lambda, not global** — a soft backstop, not
real protection. The account-lockout (maxLoginAttempts) is the meaningful anti-brute-force
control here; distributed rate-limiting is **Cloudflare WAF at cutover** (deferred).

### §3 — CSRF / cookies / CORS

In `payload.config.ts`:

- `csrf: [...]` and `cors: [...]` — **not `*`** — both derived from env: the canonical
  `https://lallafatema.ma` plus `NEXT_PUBLIC_SERVER_URL` (and a preview URL if set),
  de-duplicated. An empty `csrf` array today means cookie-auth requests aren't
  origin-checked; this closes that.
- `cookiePrefix: 'lf'` — namespacing.
- Explicit auth cookie options on `Users.auth.cookies`: `sameSite: 'Lax'` (admin is
  same-site; Lax keeps inbound links working), `secure: process.env.NODE_ENV ===
  'production'` (so local http dev still sets the cookie). Cookies are **already HttpOnly**
  by Payload default — this makes the whole posture explicit and gives the CSRF check a
  real allowlist to enforce against.

A small helper (e.g. `allowedOrigins()` in `src/lib/security-headers.ts` or a sibling)
derives the origin list once and is shared by `csrf`, `cors`, and any header that needs it,
so there is a single source of truth. Pure → unit-tested.

### §4 — Upload sanitization

In `Media.upload`:

- `mimeTypes` → explicit raster allowlist: `['image/jpeg', 'image/png', 'image/webp',
  'image/avif', 'image/gif', 'application/pdf']`. Dropping `image/*` removes **SVG** and
  other exotic image types; PDF is retained (magazine issues need it).
- **Size cap.** Prefer Payload's built-in upload size limit; if the config key differs by
  version, enforce in a `beforeValidate`/`beforeChange` hook reading the incoming file size.
  Proposed caps: ~10 MB for images, ~25 MB for PDFs. Exact mechanism verified at
  implementation against Payload 3.85.
- Filename sanitization is already handled by Payload; verify only.

### §5 — RBAC audit

A documented pass over every collection/global `access`. Current posture is good — access
is role-gated and the `Users.role` field is field-level locked to admins (no privilege
escalation). Two items to **review and tighten only if a real gap is confirmed**:

- `Users.read = Boolean(user)` — any authenticated user (incl. journalist) can read all
  user records (names, emails, bios). Acceptable for a small trusted editorial team and
  needed so admin relationship pickers can list authors; tighten to self-or-editor+ only if
  warranted.
- `Media.create/update = isAuthenticated` — any authed user can edit any media. Acceptable
  editorially; note it.

Deliverable: a short RBAC audit note (in this spec's follow-up or a `docs/` note) plus any
minimal tightening — **not** an access-control rewrite.

### §6 — Rollout & verification

1. Ship CSP as **`Content-Security-Policy-Report-Only`** (both public + admin variants).
2. Drive the public site **and** `/admin` (incl. live-preview and a media upload) through
   Playwright, capturing `console` messages; collect CSP violation reports.
3. Refine the host allowlists (esp. the admin `'unsafe-eval'`/`blob:` question) until the
   real flows produce zero violations.
4. **Flip** the header name from `...-Report-Only` to `Content-Security-Policy`.

Verification loop (matches the project's standard): `tsc --noEmit` + `eslint .` +
`pnpm build`; inspect response headers on home, an article, and `/admin`; confirm the
homepage still builds `○ Static` (ISR intact) and `0 /_next/image`; manual checks that
5 failed logins lock the account and an SVG upload is rejected.

## Testing

- **Integration / unit** (`tests/int/security-headers.int.spec.ts` or similar):
  - `security-headers.ts` emits every expected header with the expected values.
  - `publicCsp` contains `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`,
    `form-action 'self'`, and each required third-party host token.
  - `adminCsp` is a superset of the public policy (contains the admin-only additions).
  - `allowedOrigins()` includes the canonical + env URLs and excludes `*`.
- **E2E** (`tests/e2e/security.e2e.spec.ts`):
  - A public page response carries HSTS, X-Frame-Options `SAMEORIGIN`, `nosniff`,
    Referrer-Policy, Permissions-Policy, and the CSP header.
  - Navigating the site produces **no CSP violations** in the console (the enforce gate).
  - Admin `/admin` loads and **live-preview still renders** (regression guard for the
    `SAMEORIGIN` / `frame-ancestors 'self'` decision).
  - An SVG upload via the Media API/admin is rejected.

## Success criteria

1. Every public response carries all six header families with the values in §1; `/admin`
   carries the admin CSP variant.
2. CSP is **enforcing** (not Report-Only) with zero violations across the real public +
   admin flows, and **ISR is intact** (homepage `○ Static`, `0 /_next/image`).
3. Live-preview in the admin still works (framing not broken).
4. Login lockout (`maxLoginAttempts`/`lockTime`) is explicit and demonstrably locks after
   5 failures; `rateLimit` + `trustProxy` set; serverless caveat documented.
5. `csrf`/`cors` carry a real origin allowlist (no `*`); cookies are HttpOnly + Lax +
   prod-secure with the `lf` prefix.
6. `Media` rejects SVG and enforces a file-size cap; PDF still accepted.
7. An RBAC audit note exists; any change made is minimal and justified.
8. No schema/migration change, no new runtime dependency; `tsc` + `eslint` + `pnpm build`
   clean; integration + E2E tests pass.

## Follow-ups (not this spec)

- 2FA for the admin panel (own sub-project).
- Cloudflare WAF + edge rate-limiting at DNS cutover (real distributed rate-limiting).
- Optional CSP `report-to` collector once there's somewhere to send reports.
- Tighten `img-src`/`connect-src` from broad `https:` to explicit hosts using Report-Only data.
- `reserved-slug-guard` follow-up (tracked separately in memory) — an editor could create a
  page slug colliding with a static route; natural fit for a hardening pass but distinct from these five.
