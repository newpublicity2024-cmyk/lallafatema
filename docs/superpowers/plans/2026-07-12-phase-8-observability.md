# Phase 8.4 Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire error/performance monitoring (Sentry) and a health-check endpoint that stay fully inert until env vars are set, plus a cutover runbook for the external uptime monitor and R2 versioning.

**Architecture:** Add `@sentry/nextjs` with every `Sentry.init()` guarded on a DSN env var, wired through Next's `instrumentation.ts` / `instrumentation-client.ts` / `global-error.tsx` conventions and a `withSentryConfig` build wrap whose source-map upload is gated on an auth token. Add a `/healthz` route handler that answers public liveness and, only when called with a secret, does a cheap Neon `SELECT 1` readiness probe. No database schema change; no behavior change while inert.

**Tech Stack:** Next.js 16.2.6 (App Router, `src/` dir), React 19.2.6, Payload CMS 3.85.1 (Postgres adapter → Neon), `@sentry/nextjs@^10.65`, Vitest (int) + Playwright (e2e), pnpm.

## Global Constraints

- **Inert by default:** with no DSN set, the browser makes ZERO new network requests and the SDK does nothing (no init). Proven by an e2e test asserting no request to a Sentry ingest host.
- **No Session Replay** and **no browser performance tracing** (CWV discipline): client SDK does error capture only.
- **No database schema change; no migration.**
- **Preserve rendering invariants:** homepage stays `○ Static`; **0 `/_next/image`** requests; `/healthz` renders dynamic (`ƒ`), never prerendered, never in sitemaps.
- **CSP untouched:** `connect-src 'self' https:` already permits the Sentry ingest host; do NOT edit `src/lib/security-headers.ts`. No Sentry `tunnelRoute`.
- **Package manager:** use `npx pnpm@10.18.0` for all pnpm commands (the PATH `pnpm` is too old).
- **Env-var contract (verbatim):** `SENTRY_DSN` (server/edge), `NEXT_PUBLIC_SENTRY_DSN` (client, build-time inlined), `SENTRY_TRACES_SAMPLE_RATE` (default `0.1`), `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (source-map upload), `HEALTHCHECK_SECRET` (deep readiness gate).
- **Route path:** the health endpoint is `/healthz` (NOT `/api/health` — that path collides with Payload's `/api/[...slug]` catch-all across route groups and fails the build).
- **Commit style:** Conventional Commits; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work on branch `phase-8.4-observability`.

---

### Task 1: Sentry dependency + observability gate module

**Files:**
- Modify: `package.json` (add `@sentry/nextjs`)
- Create: `src/lib/observability.ts`
- Test: `tests/int/observability.int.spec.ts`

**Interfaces:**
- Consumes: nothing (reads `process.env`).
- Produces:
  - `sentryEnabled(): boolean` — true iff `process.env.SENTRY_DSN` is set.
  - `clientSentryEnabled(): boolean` — true iff `process.env.NEXT_PUBLIC_SENTRY_DSN` is set.
  - `tracesSampleRate(): number` — parsed `SENTRY_TRACES_SAMPLE_RATE`, clamped to `[0,1]`, default `0.1`.
  - `sentryEnvironment(): string` — `VERCEL_ENV` || `NODE_ENV` || `'development'`.

- [ ] **Step 1: Add the dependency**

Run:
```bash
npx pnpm@10.18.0 add '@sentry/nextjs@^10.65'
```
Expected: `package.json` dependencies gains `"@sentry/nextjs": "^10.65..."`, lockfile updates, install succeeds.

- [ ] **Step 2: Write the failing test**

Create `tests/int/observability.int.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clientSentryEnabled,
  sentryEnabled,
  sentryEnvironment,
  tracesSampleRate,
} from '@/lib/observability'

const KEYS = [
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_TRACES_SAMPLE_RATE',
  'VERCEL_ENV',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('observability gate (inert without config)', () => {
  it('sentry is disabled when no server DSN', () => {
    expect(sentryEnabled()).toBe(false)
  })

  it('client sentry is disabled when no public DSN', () => {
    expect(clientSentryEnabled()).toBe(false)
  })

  it('sentry enables when the server DSN is set', () => {
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1'
    expect(sentryEnabled()).toBe(true)
  })

  it('client sentry enables when the public DSN is set', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1'
    expect(clientSentryEnabled()).toBe(true)
  })
})

describe('tracesSampleRate', () => {
  it('defaults to 0.1 when unset', () => {
    expect(tracesSampleRate()).toBe(0.1)
  })

  it('reads a valid rate', () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25'
    expect(tracesSampleRate()).toBe(0.25)
  })

  it('falls back to 0.1 for out-of-range or garbage values', () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '2'
    expect(tracesSampleRate()).toBe(0.1)
    process.env.SENTRY_TRACES_SAMPLE_RATE = 'nope'
    expect(tracesSampleRate()).toBe(0.1)
  })
})

describe('sentryEnvironment', () => {
  it('prefers VERCEL_ENV', () => {
    process.env.VERCEL_ENV = 'production'
    expect(sentryEnvironment()).toBe('production')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx pnpm@10.18.0 exec vitest run tests/int/observability.int.spec.ts
```
Expected: FAIL — cannot resolve `@/lib/observability`.

- [ ] **Step 4: Write the module**

Create `src/lib/observability.ts`:
```ts
/**
 * Observability gate. Sentry is fully inert until a DSN is provided:
 * these helpers are the single source of truth consumed by the instrumentation
 * files so the enable/disable decision lives in exactly one place.
 */

/** Server + edge error/perf reporting is enabled only when the server DSN is set. */
export function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN)
}

/**
 * Browser error reporting is enabled only when the public DSN is set.
 * `NEXT_PUBLIC_*` is inlined at build time, so activation requires a rebuild.
 */
export function clientSentryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
}

/** Server/API performance trace sample rate; clamped to [0,1], default 0.1. */
export function tracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1
}

/** Deployment environment tag for Sentry events. */
export function sentryEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx pnpm@10.18.0 exec vitest run tests/int/observability.int.spec.ts
```
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/observability.ts tests/int/observability.int.spec.ts
git commit -m "feat(observability): add @sentry/nextjs + inert gate module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sentry instrumentation wiring

**Files:**
- Create: `src/instrumentation.ts`
- Create: `src/instrumentation-client.ts`
- Create: `src/app/global-error.tsx`

**Interfaces:**
- Consumes: `sentryEnabled`, `clientSentryEnabled`, `tracesSampleRate`, `sentryEnvironment` from `@/lib/observability` (Task 1); `@sentry/nextjs`.
- Produces: `register()` and `onRequestError` exports from `src/instrumentation.ts` (Next.js auto-discovers these); a browser-side conditional `Sentry.init`; a root `GlobalError` component.

This task has no unit test — instrumentation runs inside the Next.js runtime and is exercised by the e2e inertness proof in Task 5 and the build in Task 7. Steps are file creation + a type/lint check.

- [ ] **Step 1: Create the server/edge instrumentation**

Create `src/instrumentation.ts`:
```ts
import * as Sentry from '@sentry/nextjs'

import { sentryEnabled, sentryEnvironment, tracesSampleRate } from '@/lib/observability'

export function register(): void {
  if (!sentryEnabled()) return
  // Runs for both the Node.js and Edge server runtimes; both share the same config.
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: tracesSampleRate(),
      environment: sentryEnvironment(),
    })
  }
}

// Safe no-op when Sentry is uninitialized (no DSN); captures server component /
// route handler errors when enabled.
export const onRequestError = Sentry.captureRequestError
```

- [ ] **Step 2: Create the browser instrumentation (errors only)**

Create `src/instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs'

import { clientSentryEnabled, sentryEnvironment } from '@/lib/observability'

// Errors only: no browser performance tracing and no Session Replay (CWV discipline).
if (clientSentryEnabled()) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
```

- [ ] **Step 3: Create the global error boundary (RTL Arabic)**

Create `src/app/global-error.tsx`:
```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Root error boundary: reports to Sentry (no-op when uninitialized) and renders a
// minimal Arabic RTL fallback. Must define its own <html>/<body>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>حدث خطأ ما</h1>
        <p style={{ margin: 0 }}>نعتذر، حدث خطأ غير متوقع. حاول تحديث الصفحة.</p>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Type-check and lint the new files**

Run:
```bash
npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 run lint
```
Expected: no errors. (If `@sentry/nextjs` types complain about `captureRequestError`, confirm the installed version exports it — it does in v8+.)

- [ ] **Step 5: Commit**

```bash
git add src/instrumentation.ts src/instrumentation-client.ts src/app/global-error.tsx
git commit -m "feat(observability): wire Sentry instrumentation (inert without DSN)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: withSentryConfig build wrap

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `withSentryConfig` from `@sentry/nextjs`.
- Produces: no runtime export change; the build now injects Sentry instrumentation and (only with an auth token) uploads source maps.

- [ ] **Step 1: Wrap the exported config**

Modify `next.config.ts`. Add the import near the other imports:
```ts
import { withSentryConfig } from '@sentry/nextjs'
```
Replace the final export line:
```ts
export default withPayload(nextConfig, { devBundleServerPackages: false })
```
with:
```ts
export default withSentryConfig(withPayload(nextConfig, { devBundleServerPackages: false }), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet during builds; no CSP change (no tunnelRoute).
  silent: true,
  // Upload source maps only when an auth token is present.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
})
```

- [ ] **Step 2: Verify the build still succeeds and stays inert**

Run:
```bash
npx pnpm@10.18.0 run build
```
Expected: build completes; no source-map upload step runs (no auth token); the homepage `/` is listed as `○` (Static) in the route table; `/healthz` not present yet.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(observability): wrap next config with Sentry (source maps gated on auth token)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Health-check endpoint (`/healthz`)

**Files:**
- Create: `src/lib/health.ts`
- Create: `src/app/(frontend)/healthz/route.ts`
- Test: `tests/int/health.int.spec.ts`

**Interfaces:**
- Consumes: `getPayloadClient` from `@/lib/payload` (for the DB ping); `NextRequest`/`NextResponse` from `next/server`.
- Produces:
  - `healthDeepCheckRequested(input: { deepParam: string | null; headerSecret: string | null }): boolean` in `src/lib/health.ts` — true only when `HEALTHCHECK_SECRET` is set AND one of the inputs equals it.
  - `GET` handler at `/healthz`.

- [ ] **Step 1: Write the failing test for the pure gate helper**

Create `tests/int/health.int.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { healthDeepCheckRequested } from '@/lib/health'

let saved: string | undefined

beforeEach(() => {
  saved = process.env.HEALTHCHECK_SECRET
  delete process.env.HEALTHCHECK_SECRET
})

afterEach(() => {
  if (saved === undefined) delete process.env.HEALTHCHECK_SECRET
  else process.env.HEALTHCHECK_SECRET = saved
})

describe('healthDeepCheckRequested', () => {
  it('is false when the secret env is unset (even if a value is passed)', () => {
    expect(healthDeepCheckRequested({ deepParam: 'anything', headerSecret: null })).toBe(false)
  })

  it('is false with no inputs when the secret is set', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: null, headerSecret: null })).toBe(false)
  })

  it('is true when the query param matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: 's3cret', headerSecret: null })).toBe(true)
  })

  it('is true when the header matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: null, headerSecret: 's3cret' })).toBe(true)
  })

  it('is false when neither input matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: 'wrong', headerSecret: 'nope' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx pnpm@10.18.0 exec vitest run tests/int/health.int.spec.ts
```
Expected: FAIL — cannot resolve `@/lib/health`.

- [ ] **Step 3: Write the gate helper**

Create `src/lib/health.ts`:
```ts
/**
 * Decide whether a /healthz request should run the deep DB-readiness probe.
 * Gated on HEALTHCHECK_SECRET: unset ⇒ always liveness-only; set ⇒ deep only when
 * the query param `deep` OR the `x-health-secret` header equals the secret.
 * DB status is never exposed to callers that don't hold the secret.
 */
export function healthDeepCheckRequested(input: {
  deepParam: string | null
  headerSecret: string | null
}): boolean {
  const secret = process.env.HEALTHCHECK_SECRET
  if (!secret) return false
  return input.deepParam === secret || input.headerSecret === secret
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx pnpm@10.18.0 exec vitest run tests/int/health.int.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Write the route handler**

Create `src/app/(frontend)/healthz/route.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server'

import { healthDeepCheckRequested } from '@/lib/health'
import { getPayloadClient } from '@/lib/payload'

// Never statically generated; must reflect live state on each request.
export const dynamic = 'force-dynamic'

const NOINDEX = { 'X-Robots-Tag': 'noindex' } as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deep = healthDeepCheckRequested({
    deepParam: req.nextUrl.searchParams.get('deep'),
    headerSecret: req.headers.get('x-health-secret'),
  })

  // Public liveness: fast, no DB touch.
  if (!deep) {
    return NextResponse.json({ status: 'ok' }, { headers: NOINDEX })
  }

  // Secret-gated readiness: cheap DB ping via the Postgres pool.
  try {
    const payload = await getPayloadClient()
    const db = payload.db as unknown as { pool: { query: (q: string) => Promise<unknown> } }
    await db.pool.query('SELECT 1')
    return NextResponse.json({ status: 'ok', db: 'ok' }, { headers: NOINDEX })
  } catch {
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503, headers: NOINDEX })
  }
}
```

- [ ] **Step 6: Verify liveness responds (dev server)**

Run (in one shell):
```bash
npx pnpm@10.18.0 run dev
```
In another shell:
```bash
curl -s -i http://localhost:3000/healthz
```
Expected: `HTTP/1.1 200`, header `X-Robots-Tag: noindex`, body `{"status":"ok"}`. Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add src/lib/health.ts 'src/app/(frontend)/healthz/route.ts' tests/int/health.int.spec.ts
git commit -m "feat(observability): add /healthz liveness + secret-gated DB readiness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: e2e inertness proof + healthz check

**Files:**
- Create: `tests/e2e/observability.e2e.spec.ts`

**Interfaces:**
- Consumes: the running app (Playwright base URL `http://localhost:3000`), inert (no `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in the test env).
- Produces: an e2e spec proving no Sentry ingest request fires and `/healthz` returns 200.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/observability.e2e.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// Runs inert (no Sentry DSN configured): the page must make NO request to a Sentry
// ingest host, and the health endpoint must answer liveness.
test.describe('observability (inert)', () => {
  test('loads no Sentry SDK network calls when unconfigured', async ({ page }) => {
    const sentryRequests: string[] = []
    page.on('request', (r) => {
      const url = r.url()
      if (url.includes('sentry.io') || url.includes('ingest.sentry')) sentryRequests.push(url)
    })

    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    expect(sentryRequests).toEqual([])
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('/healthz returns 200 liveness', async ({ request }) => {
    const res = await request.get(`${BASE}/healthz`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run the e2e test**

Run:
```bash
npx pnpm@10.18.0 run test:e2e -- tests/e2e/observability.e2e.spec.ts
```
Expected: 2 passed. (Playwright's config starts the app; confirm no `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are exported in the shell.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/observability.e2e.spec.ts
git commit -m "test(observability): e2e inertness proof + /healthz liveness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Env docs + cutover activation runbook

**Files:**
- Modify: `.env.example`
- Create: `docs/superpowers/notes/2026-07-12-observability-activation.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Append the Phase 8.4 env block**

Append to `.env.example` (after the Phase 6 block):
```
# ── Phase 8.4: Observability (filled in at cutover) ──
# Sentry — set the DSNs to enable error/perf reporting; unset ⇒ Sentry is fully inert.
# NEXT_PUBLIC_SENTRY_DSN is inlined at BUILD time, so rebuild after setting it.
# SENTRY_DSN=
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_TRACES_SAMPLE_RATE=0.1
# Source-map upload (optional, build-time): set all three for readable stack traces.
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# Health check — set to enable the secret-gated deep DB readiness probe; unset ⇒ liveness only.
# HEALTHCHECK_SECRET=
```

- [ ] **Step 2: Write the activation runbook**

Create `docs/superpowers/notes/2026-07-12-observability-activation.md`:
```markdown
# Observability activation runbook (Phase 8.4)

Everything below is INERT in code until these steps run at cutover (Phase 8.5).

## 1. Sentry
1. Create a Sentry project (platform: Next.js). Copy the DSN.
2. In Vercel env (Production + Preview), set:
   - `SENTRY_DSN` = the DSN
   - `NEXT_PUBLIC_SENTRY_DSN` = the same DSN
   - `SENTRY_TRACES_SAMPLE_RATE` = `0.1` (tune later)
3. For readable stack traces, also set (build-time): `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`.
4. **Rebuild** (the public DSN is inlined at build time — a redeploy without a
   rebuild will not activate the browser SDK).
5. Trigger a test error and confirm it appears in Sentry.

## 2. Uptime monitor
Endpoint: `https://lallafatema.ma/healthz` → `200 {"status":"ok"}`.
- Provider options: **Cloudflare Health Checks** (recommended once Cloudflare
  fronts the site), **UptimeRobot** (free), or **Better Stack**.
- Poll every 1–5 min; alert to email/Slack.
- Optional DB readiness monitor: set `HEALTHCHECK_SECRET` in Vercel, then point a
  second monitor at `https://lallafatema.ma/healthz?deep=<secret>` (or send the
  `x-health-secret` header). A 503 means Neon is unreachable.

## 3. R2 object versioning
1. In Cloudflare → R2 → the media bucket → enable **Object Versioning**.
2. Add a lifecycle rule expiring **noncurrent** versions after ~30 days (caps cost
   while protecting against accidental overwrite/delete of uploaded media).
3. No app code change — the S3 storage adapter is unaffected.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/superpowers/notes/2026-07-12-observability-activation.md
git commit -m "docs(observability): env vars + cutover activation runbook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification gate + PLAN.md status

**Files:**
- Modify: `PLAN.md` (Phase 8 status line for item #4)

**Interfaces:** none (verification + bookkeeping).

- [ ] **Step 1: Run the full type/lint/build gate**

Run:
```bash
npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 run lint && npx pnpm@10.18.0 run build
```
Expected: all clean. In the build route table, confirm:
- `/` (homepage) is `○` (Static) — Sentry wrap did not force it dynamic.
- `/healthz` is `ƒ` (Dynamic).

- [ ] **Step 2: Run the full unit + e2e suites**

Run:
```bash
npx pnpm@10.18.0 run test:int && npx pnpm@10.18.0 run test:e2e
```
Expected: all pass, including the new `observability` and `health` specs. No regressions in existing specs.

- [ ] **Step 3: Confirm the image rule is intact**

During the e2e run (or a manual dev-server load of `/`), confirm **0 requests to `/_next/image`** (grep the Playwright trace / network log, consistent with prior phases). Expected: zero.

- [ ] **Step 4: Update PLAN.md**

In `PLAN.md`, under Phase 8, mark observability done. Append to the Phase 8 status (mirroring the style of prior sub-project status notes) a line such as:
```
  - **Status (item #4 Observability): DONE [2026-07-12].** Sentry (errors + light
    server tracing, NO Session Replay) wired via instrumentation.ts /
    instrumentation-client.ts / global-error.tsx + withSentryConfig (source maps
    gated on SENTRY_AUTH_TOKEN), **inert until SENTRY_DSN set**; `/healthz` public
    liveness + secret-gated (`HEALTHCHECK_SECRET`) Neon `SELECT 1` readiness. No
    schema change; CSP untouched (connect-src already allows ingest). Verified:
    tsc+eslint+build clean, homepage still ○ Static, /healthz ƒ, 0 /_next/image,
    unit + e2e (inertness proof) green. Uptime monitor + R2 versioning documented
    in docs/superpowers/notes/2026-07-12-observability-activation.md for cutover.
    **Remaining in Phase 8: item #5 Launch/DNS cutover (blocked on Vercel + domain).**
```

- [ ] **Step 5: Commit**

```bash
git add PLAN.md
git commit -m "docs(observability): mark Phase 8.4 done in PLAN.md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Sentry errors + light server tracing, inert → Tasks 1–3. ✓
- No Session Replay / no browser tracing → Task 2 Step 2 (rates 0). ✓
- Health endpoint (public liveness + secret-gated DB readiness) → Task 4. ✓
- `.env.example` block → Task 6 Step 1. ✓
- Activation runbook (uptime + R2 versioning + Sentry) → Task 6 Step 2. ✓
- CSP untouched → Global Constraints + no task edits `security-headers.ts`. ✓
- No schema change → no migration task exists. ✓
- Testing (gate unit, health unit, inertness e2e, build/static/`_next/image`) → Tasks 1, 4, 5, 7. ✓
- Honest caveats (dep bundled inert; Next 16 compat) → Task 1 (install) + Task 2 Step 4 note. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; no "similar to Task N". ✓

**Type consistency:** `healthDeepCheckRequested` signature identical in Task 4 helper, test, and route. `sentryEnabled`/`clientSentryEnabled`/`tracesSampleRate`/`sentryEnvironment` names identical across Tasks 1 and 2. `/healthz` path consistent across Tasks 4, 5, 6, 7. ✓

**Deviation from spec:** endpoint path is `/healthz`, not the spec's `/api/health`, to avoid a build-time route collision with Payload's `/api/[...slug]` catch-all. Documented in Global Constraints and the runbook.
