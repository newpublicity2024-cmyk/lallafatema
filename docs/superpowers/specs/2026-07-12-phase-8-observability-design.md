# Phase 8.4 — Observability (Design)

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review
**Sub-project:** Phase 8 (hardening & launch), item #4 of 5

## Problem

The site has **no error reporting, no performance monitoring, and no health
endpoint**. There is no `instrumentation.ts`, no Sentry, and nothing an external
uptime monitor can poll. If a server route throws, an edge function fails, or the
Neon connection drops in production, the failure is invisible — we would learn about
it from users, not tooling. The R2 media bucket has no versioning, so an accidental
overwrite or delete of an uploaded asset is unrecoverable. Launch (8.5) should not
happen blind.

## Goal

Wire observability so it **activates by setting environment variables at cutover**,
with **no database schema change** and **no behavior change while inert**: the site
stays static/ISR, Core Web Vitals are untouched, and the browser makes **zero new
network requests** until a DSN is set. Two of the three items (external uptime
monitor, R2 object-versioning) are dashboard/ops actions on services the user
controls at cutover — those are **documented as an activation runbook**, not built
now, mirroring the inert credential-gated pattern used across Phase 6.

## Scope

**In scope — build now:**

1. **Sentry** — errors + light server tracing, **inert until DSN set**. Client +
   server + edge error capture; low-sample-rate server/API performance tracing.
   **No Session Replay** (avoids a heavy client bundle and the Law 09-08/GDPR
   consent + PII-masking burden).
2. **Health-check endpoint** — public liveness + secret-gated DB readiness.
3. **`.env.example`** — documented, commented-out (inert by default).

**In scope — document now, execute at cutover (activation runbook):**

4. **Uptime monitor** — external provider polling the health endpoint.
5. **R2 object-versioning** — enabled on the bucket + a noncurrent-version lifecycle
   rule to cap cost.
6. **Sentry activation** — project creation, env vars in Vercel, source-map upload.

**Out of scope / deferred (YAGNI or wrong phase):**

- **Session Replay** — heavy client bundle; needs consent wiring + PII masking.
  Rejected deliberately, not overlooked.
- **APM dashboards, log aggregation, custom metrics** — beyond a pre-launch baseline.
- **Any deployment** — deploy is deferred to 8.5; work stays local.

## Design principles

- **Inert by default, flip-a-switch on.** Every `Sentry.init()` is guarded on DSN
  presence. No DSN ⇒ the SDK loads but does nothing: no network, no measurable
  overhead. This is exactly how Meilisearch / Brevo / OneSignal ship inert.
- **CWV-first.** No Session Replay; browser tracing off; the client SDK does error
  capture only. Pages that are `○ Static` today stay static; the `0 /_next/image`
  rule is preserved.
- **Static-safe health check.** The health route is `force-dynamic` and `noindex`;
  it never runs during static generation and never appears in sitemaps.
- **No secret leakage.** DB up/down status is never exposed to anonymous callers —
  the deep readiness path is secret-gated and degrades silently to liveness.
- **Honest about cost.** Approach A adds a real `@sentry/nextjs` dependency that is
  bundled even when inert. This is called out, not hidden — Sentry has no
  server-side CDN path, so a dependency is unavoidable (unlike OneSignal's CDN load).

## Approaches considered

**A — Official `@sentry/nextjs` SDK, gated inert (CHOSEN).** Wire the canonical
Next.js integration and guard every init on DSN presence. Gives real coverage
(server errors, edge, `onRequestError`, source maps) the instant a DSN lands, and
"inert" is proven by asserting no ingest network request when the DSN is unset.
Cost: a genuine (large) dependency in the bundle even while inert.

**B — Thin custom wrapper, lazy-import the SDK only when enabled.** Keeps the dep
out of the inert path via dynamic import. **Rejected** — reinvents
auto-instrumentation, `onRequestError`, and source-map upload poorly; fragile
against SDK changes.

**C — Defer Sentry; ship only the health endpoint + docs.** **Rejected** — the
point of 8.4 is flip-a-switch observability wired and ready for cutover.

## Architecture

### §1 — Sentry gate module

New `src/lib/observability.ts` is the single source of truth:

- `sentryEnabled` — `true` when the server `SENTRY_DSN` is set (server/edge).
- `clientSentryEnabled` — `true` when `NEXT_PUBLIC_SENTRY_DSN` is set (build-time
  inlined, so activation requires a rebuild — documented).
- Shared init options builder: `tracesSampleRate` read from
  `SENTRY_TRACES_SAMPLE_RATE` (default `0.1`), `replaysSessionSampleRate: 0`,
  `replaysOnErrorSampleRate: 0` (replay explicitly disabled), environment tag from
  `NODE_ENV`/`VERCEL_ENV`.

Pure and unit-testable; the instrumentation files consume it, they don't re-derive
the gate.

### §2 — Instrumentation wiring (Next.js conventions)

- `src/instrumentation.ts` — `register()` calls `Sentry.init(...)` for the
  `nodejs` and `edge` runtimes **only when `sentryEnabled`**. Exports
  `onRequestError` → `Sentry.captureRequestError` (guarded).
- `src/instrumentation-client.ts` — browser init, guarded on
  `clientSentryEnabled`; **errors only** (no `browserTracingIntegration`, no
  `replayIntegration`).
- `src/app/global-error.tsx` — client error boundary that calls
  `Sentry.captureException` and renders a minimal **RTL Arabic** error page
  (`<html lang="ar" dir="rtl">`), consistent with the site's language.

### §3 — Build config

`next.config.ts` composes `withSentryConfig(withPayload(nextConfig, ...), sentryBuildOptions)`.
Source-map upload runs only when `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`,
`SENTRY_PROJECT`) are present; absent, `withSentryConfig` is a quiet no-op wrapper
(no upload, no tunnel). Verify the wrap does not force pages dynamic and preserves
the custom image loader.

### §4 — CSP

**No change required.** `src/lib/security-headers.ts` already sets
`connect-src 'self' https:`, which permits the Sentry ingest host (`*.ingest.*.sentry.io`)
over HTTPS. No `tunnel` option is used (which would need a same-origin rewrite).
This is stated so the security-headers module is not touched blindly.

### §5 — Health-check endpoint

New `src/app/api/health/route.ts`:

- `export const dynamic = 'force-dynamic'` and `noindex` (never statically cached,
  never crawled).
- `GET /api/health` → `200 {status:"ok"}` — public liveness, **no DB touch**.
- `GET /api/health?deep=<HEALTHCHECK_SECRET>` (query param or `x-health-secret`
  header) → runs a cheap `SELECT 1` against Neon via Payload's DB adapter →
  `200 {status:"ok",db:"ok"}` on success, `503 {status:"error",db:"down"}` on
  failure.
- Without the secret, with a wrong secret, or when `HEALTHCHECK_SECRET` is unset,
  the endpoint behaves as **shallow liveness** and never reveals DB status. No
  timing oracle beyond "did it touch the DB".

### §6 — Environment variables (`.env.example`)

A new commented block (inert by default), phrased like the existing Phase 6 block:

```
# ── Phase 8.4: Observability (filled in at cutover) ──
# Sentry — set the DSNs to enable error/perf reporting; unset ⇒ Sentry is fully inert.
# NEXT_PUBLIC_SENTRY_DSN is inlined at BUILD time, so rebuild after setting it.
# SENTRY_DSN=
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_TRACES_SAMPLE_RATE=0.1
# Source-map upload (optional, build-time): set all three to upload readable stack traces.
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# Health check — set to enable the secret-gated deep DB readiness probe; unset ⇒ liveness only.
# HEALTHCHECK_SECRET=
```

### §7 — Activation runbook (documented, executed at cutover)

New note `docs/superpowers/notes/2026-07-12-observability-activation.md`:

- **Sentry:** create the project; set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in
  Vercel; add `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source maps;
  **rebuild** (client DSN is build-time inlined); trigger a test error and confirm
  it lands.
- **Uptime monitor:** provider options — **UptimeRobot** (free, simplest),
  **Better Stack**, or **Cloudflare Health Checks** (already in the Cloudflare
  stack, recommended once Cloudflare fronts the site). Monitor
  `https://lallafatema.ma/api/health` every 1–5 min with an alert channel; optional
  second monitor hitting the deep readiness with the secret if the provider supports
  custom query params/headers.
- **R2 versioning:** enable Object Versioning on the media bucket (Cloudflare
  dashboard or Wrangler); add a lifecycle rule expiring noncurrent versions after
  ~30 days to cap storage cost. Protects against accidental overwrite/delete of
  uploaded media.

## Files

**New:**
- `src/lib/observability.ts` — gate + shared Sentry options
- `src/instrumentation.ts` — server/edge register + onRequestError
- `src/instrumentation-client.ts` — browser init (errors only)
- `src/app/global-error.tsx` — RTL Arabic error boundary → Sentry
- `src/app/api/health/route.ts` — liveness + gated DB readiness
- `docs/superpowers/notes/2026-07-12-observability-activation.md` — runbook
- Tests: observability gate unit, health route unit, inertness e2e

**Modified:**
- `next.config.ts` — `withSentryConfig` wrap (source maps gated on auth token)
- `.env.example` — Phase 8.4 block
- `package.json` — add `@sentry/nextjs` (latest compatible with Next 16.2.6 / React 19)

**Unchanged (deliberately):** `src/lib/security-headers.ts` (CSP already permits
ingest); `src/payload.config.ts` (R2 versioning is a bucket setting, not app code);
no migration.

## Testing / verification

- **Unit:** observability gate (enabled vs disabled from env); health route
  (liveness always `ok`; deep w/o secret → shallow; wrong secret → shallow; correct
  secret → DB path returns ok/503).
- **e2e (Playwright):** **inertness proof** — with no DSN, no request to a Sentry
  ingest host and no new console error (mirrors the OneSignal inert e2e);
  `/api/health` returns 200 with `{status:"ok"}`.
- **Gates:** `tsc` + `eslint` + `pnpm build` clean; homepage stays `○ Static`;
  **0 `/_next/image`** requests unchanged; `/api/health` renders as a dynamic route
  (`ƒ`), not prerendered.

## Honest caveats

- Adds a real `@sentry/nextjs` dependency, bundled even when inert (it does nothing
  without a DSN, but it is present). Unavoidable trade-off of Approach A.
- `@sentry/nextjs` compatibility with **Next 16.2.6 / React 19** will be pinned to
  the latest release and verified during execution; if a hard incompatibility
  surfaces, fall back to the newest supported minor and note it.
- The deep health check runs one query per gated call — negligible, and not
  reachable anonymously.
