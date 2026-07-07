# Phase 6 (sub-project 5) — OneSignal Web Push (env-gated inert) — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-07
**Status:** Approved — ready for implementation plan.

## Goal

Let visitors subscribe to **web push** via OneSignal, built **env-gated inert** and **CWV-first**: with no
OneSignal config the app loads nothing (no SDK, no service worker, no network) and builds/serves normally;
when configured, the SDK loads **lazily on idle** — off the critical path — and OneSignal's own prompt handles
opt-in. **Subscription only** (sending pushes stays in the OneSignal dashboard). **No custom UI.**

This is the final sub-project of Phase 6 (siblings: magazine archive, per-video watch pages, Meilisearch
search, Brevo newsletter — all done). **No schema changes.**

## Confirmed decisions

| Topic | Decision |
|---|---|
| Scope | **Subscription only** — load SDK + service worker + let visitors opt in. Sending is done from the OneSignal dashboard. The REST API key is **not used** here (reserved). |
| Opt-in UI | **OneSignal's built-in prompt** (configured in the OneSignal dashboard). Zero custom UI in our code; `OneSignalInit` renders `null`. |
| Priority | **Fast & smooth** (user's words) — the third-party SDK loads **only on idle**, `async`, off the LCP/hydration path; no layout shift; **zero cost when inert**. |
| Gate | Public **`NEXT_PUBLIC_ONESIGNAL_APP_ID`** (the app id is public by design — it ships to the browser). Unset → inert. Optional `NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`. |
| Consent | Push is a **separate, explicit browser opt-in** (the native "Allow notifications" dialog), so v1 loads the SDK independently of the cookie CMP. Gating init behind `readConsentCookie()` is a one-line future addition (noted, not built). |
| Schema | **None.** |

## Current-state facts (verified against code)

- **No `public/` directory exists yet** — we create it for the OneSignal service worker (Next serves `public/`
  at the site root, so `public/OneSignalSDKWorker.js` → `/OneSignalSDKWorker.js`).
- **`src/app/(frontend)/layout.tsx`** mounts client components in `<body>` (`ConsentMode`, `SiteScripts`,
  `ConsentBanner`) — the natural home for `<OneSignalInit />`. Reading `process.env` in this server layout does
  not force dynamic rendering.
- **`.env.example:36-37`** reserves `# ONESIGNAL_APP_ID=` / `# ONESIGNAL_REST_API_KEY=`. Because the app id must
  reach the browser it becomes **`NEXT_PUBLIC_ONESIGNAL_APP_ID`**; we add `NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`
  and keep `ONESIGNAL_REST_API_KEY` reserved-but-unused.
- `readConsentCookie()` (`src/lib/consent.ts`) gives client-side consent state if we ever want to gate push.
- **`NEXT_PUBLIC_*` vars are inlined at build time** in Next — so activation = set env **+ rebuild** (unlike the
  runtime env of search/newsletter). This is inherent to client-side config and is documented for activation.

## Architecture

### 1. Gate + config — `src/lib/push.ts` (new)

Small, pure, unit-testable:
- `pushEnabled(): boolean` → `Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID)`.
- `type PushConfig = { appId: string; safariWebId?: string }`.
- `getPushConfig(): PushConfig | null` → `null` when the app id is absent; else `{ appId, safariWebId }`
  (safariWebId omitted when unset).

(These re-read `process.env` on each call, so the unit test is hermetic. In the client bundle Next inlines the
values; in Vitest they're plain env reads → `undefined` → inert.)

### 2. Init component — `src/components/OneSignalInit.tsx` (new, `'use client'`, renders `null`)

- On mount (`useEffect`): `getPushConfig()`; **if `null` → return immediately** (fully inert — no script, no SW,
  no network). If already injected (fast client-nav guard), return.
- If configured: schedule the load with **`requestIdleCallback`** (fallback `setTimeout(load, 3000)`), so the SDK
  never competes with LCP/hydration. `load()` seeds `window.OneSignalDeferred` with an `OneSignal.init({ appId,
  safari_web_id? })` call, then appends the SDK `<script async src="…/v16/OneSignalSDK.page.js">`. OneSignal
  registers its service worker and shows its built-in prompt.
- Returns `null` — no UI, no CLS. A minimal `declare global` types `window.OneSignalDeferred`.
- Mounted once in the layout `<body>`; **self-gates** (no-op `useEffect` when disabled).

### 3. Service worker — `public/OneSignalSDKWorker.js` (new)

One line: `importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')`. Served at
`/OneSignalSDKWorker.js`. Static, inert dead weight until the SDK registers it (only when push is active).

### 4. Layout wiring — `src/app/(frontend)/layout.tsx`

Import and mount `<OneSignalInit />` in `<body>` (alongside `ConsentMode`/`SiteScripts`). It renders `null` and
self-gates, so mounting it always is harmless and free when inert.

### 5. Env

`.env.example`: replace `# ONESIGNAL_APP_ID=` with `# NEXT_PUBLIC_ONESIGNAL_APP_ID=`, add
`# NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID=`, keep `# ONESIGNAL_REST_API_KEY=` (reserved, unused this sub-project),
with a note that the public vars are build-time (rebuild to activate).

## Files

| File | Change |
|---|---|
| `src/lib/push.ts` | **New** — `pushEnabled()` + `getPushConfig()` |
| `src/components/OneSignalInit.tsx` | **New** — lazy-on-idle SDK load + init; `null` render; inert when unconfigured |
| `public/OneSignalSDKWorker.js` | **New** — OneSignal SW importScripts |
| `src/app/(frontend)/layout.tsx` | Mount `<OneSignalInit />` |
| `.env.example` | Public OneSignal vars (+ reserved REST key) |
| `tests/int/push.int.spec.ts` | **New** — `pushEnabled()` false + `getPushConfig()` null without env |
| `tests/e2e/push.e2e.spec.ts` | **New** — inert: no `onesignal.com` request, no OneSignal service worker, page renders |

## Verification

**Inert (no push env — the state everything is verified in):**
- `tsc --noEmit` + `eslint .` + `next build` clean; homepage stays `○` static (mounting the null component
  doesn't make it dynamic).
- Unit (Vitest): `pushEnabled()` → false; `getPushConfig()` → null.
- Playwright (dev server, no env): loading the homepage issues **no** request to `onesignal.com`, registers **no**
  OneSignal service worker, and the page renders normally (no console error from the missing SDK).

**Activation (later — out of this sub-project's automated run):** in OneSignal, create a Web Push app and
configure its prompt; set `NEXT_PUBLIC_ONESIGNAL_APP_ID` (+ `NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID` for Safari)
and **rebuild**; the SDK then loads on idle and OneSignal's prompt lets visitors subscribe. Sending campaigns is
done from the OneSignal dashboard.

## Out of scope (this sub-project)

- **Sending** notifications from the app (no REST-key usage, no auto-push-on-publish hook) — done from the
  OneSignal dashboard; a `send-on-publish` hook could be added later behind the reserved REST key.
- A custom subscribe bell/button (using OneSignal's built-in prompt instead).
- Gating the SDK behind the cookie CMP (push is a separate explicit opt-in; easy to add later via
  `readConsentCookie()`).
- Segmenting/tagging subscribers, rich in-app messaging, notification preferences UI.

## Deferred ideas (noted, not lost)

- `send-on-publish` automation (curated) via the OneSignal REST API + a Payload hook + the reserved REST key.
- A custom, on-brand subscribe control if the built-in prompt underperforms.
- CMP-gated push init if legal/consent review prefers it.

---
*Phase: 06-onesignal-push*
*Design gathered: 2026-07-07*
