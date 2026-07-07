# OneSignal Web Push (env-gated inert) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors subscribe to OneSignal web push, built env-gated inert and CWV-first — with no config the app loads nothing (no SDK, no service worker, no network); when configured, the SDK loads lazily on idle and OneSignal's built-in prompt handles opt-in.

**Architecture:** A tiny pure gate (`src/lib/push.ts`) reads the public `NEXT_PUBLIC_ONESIGNAL_APP_ID`. A client component (`OneSignalInit`, renders `null`) mounted in the layout injects the OneSignal SDK **only on idle** when configured, and no-ops otherwise. A static `public/OneSignalSDKWorker.js` is the service worker OneSignal registers when active. Subscription only — the REST key (sending) is reserved and unused.

**Tech Stack:** Next.js 16 (App Router, client components, `public/` static serving), OneSignal Web SDK v16 (loaded from CDN, lazily), Vitest (int), Playwright (e2e).

## Global Constraints

Every task's requirements implicitly include these (from the approved spec):

- **Env-gated inert is the contract.** `pushEnabled()` ⇔ `NEXT_PUBLIC_ONESIGNAL_APP_ID` is set. When unset:
  `getPushConfig()` returns `null`, `OneSignalInit` renders `null` and its effect returns immediately — **no
  script injected, no service worker registered, no network request, and nothing throws.** The app builds and
  serves normally.
- **CWV-first.** When configured, the SDK loads **only on idle** (`requestIdleCallback`, `setTimeout(…,3000)`
  fallback), the `<script>` is `async`, and the component renders `null` (no UI → no CLS). Zero cost when inert.
- **Subscription only.** No use of `ONESIGNAL_REST_API_KEY`, no send-on-publish hook. Opt-in is OneSignal's
  built-in prompt (dashboard-configured) — **no custom UI**.
- The gate var is **public** (`NEXT_PUBLIC_ONESIGNAL_APP_ID`) because the app id ships to the browser (it is not
  a secret). `NEXT_PUBLIC_*` is inlined at build time, so activation = set env **+ rebuild** (documented, not a
  bug).
- **No schema changes.** The SDK version pinned in the code and the service worker must match (both `v16`).
- pnpm is invoked as **`npx pnpm@10.18.0`**.

---

### Task 1: Gate + config + inert unit tests

**Files:**
- Create: `src/lib/push.ts`
- Test: `tests/int/push.int.spec.ts`

**Interfaces:**
- Produces (used by Task 2): `pushEnabled(): boolean`, `getPushConfig(): PushConfig | null`,
  `type PushConfig = { appId: string; safariWebId?: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/int/push.int.spec.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'

import { getPushConfig, pushEnabled } from '@/lib/push'

// Runs WITHOUT OneSignal config → verifies the inert contract: nothing is enabled.
beforeAll(() => {
  delete process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  delete process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID
})

describe('push gate (inert without config)', () => {
  it('is disabled when the public app id is absent', () => {
    expect(pushEnabled()).toBe(false)
  })

  it('getPushConfig returns null when disabled', () => {
    expect(getPushConfig()).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/push.int.spec.ts`
Expected: FAIL — cannot resolve `@/lib/push`.

- [ ] **Step 3: Implement the gate**

Create `src/lib/push.ts`:

```ts
/** OneSignal web push is enabled only when the public app id is configured. */
export function pushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID)
}

export type PushConfig = { appId: string; safariWebId?: string }

/**
 * Client-safe push config, or null when disabled. `NEXT_PUBLIC_*` vars are inlined at
 * build time in the client bundle; here (and in tests) they are read from process.env.
 */
export function getPushConfig(): PushConfig | null {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  if (!appId) return null
  const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID
  return { appId, ...(safariWebId ? { safariWebId } : {}) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/push.int.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/push.ts tests/int/push.int.spec.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/push.ts tests/int/push.int.spec.ts
git commit -m "feat(push): OneSignal gate + config (env-gated inert) + unit tests"
```

---

### Task 2: Init component + service worker + layout wiring + env + e2e

**Files:**
- Create: `src/components/OneSignalInit.tsx`
- Create: `public/OneSignalSDKWorker.js`
- Modify: `src/app/(frontend)/layout.tsx`
- Modify: `.env.example`
- Test: `tests/e2e/push.e2e.spec.ts`

**Interfaces:**
- Consumes: `getPushConfig` from `@/lib/push` (Task 1).

- [ ] **Step 1: Implement the init component**

Create `src/components/OneSignalInit.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

import { getPushConfig } from '@/lib/push'

const SDK_SRC = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'

type OneSignalApi = { init: (opts: { appId: string; safari_web_id?: string }) => Promise<void> }

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalApi) => void>
  }
}

/**
 * Loads the OneSignal web-push SDK — but only when configured, and only on idle so it
 * never competes with LCP/hydration (CWV-safe). Renders nothing; OneSignal's own prompt
 * handles opt-in. Fully inert without NEXT_PUBLIC_ONESIGNAL_APP_ID: no script, no service
 * worker, no network.
 */
export function OneSignalInit() {
  useEffect(() => {
    const cfg = getPushConfig()
    if (!cfg) return
    // Guard against double injection (e.g. fast client navigation).
    if (document.querySelector(`script[src="${SDK_SRC}"]`)) return

    const load = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || []
      window.OneSignalDeferred.push((OneSignal) => {
        void OneSignal.init({
          appId: cfg.appId,
          ...(cfg.safariWebId ? { safari_web_id: cfg.safariWebId } : {}),
        })
      })
      const s = document.createElement('script')
      s.src = SDK_SRC
      s.async = true
      document.head.appendChild(s)
    }

    // Load only once the browser is idle, well after the critical path.
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(load)
    } else {
      const t = setTimeout(load, 3000)
      return () => clearTimeout(t)
    }
  }, [])

  return null
}
```

Note: if `tsc` reports `requestIdleCallback` is not on `Window`, this project's `lib.dom` already includes it —
no change needed; the `typeof … === 'function'` guard covers the runtime (older Safari) case.

- [ ] **Step 2: Create the service worker**

Create `public/OneSignalSDKWorker.js` (this creates the `public/` directory; Next serves it at
`/OneSignalSDKWorker.js`):

```js
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')
```

- [ ] **Step 3: Mount in the layout**

In `src/app/(frontend)/layout.tsx`, add the import next to the other component imports:

```ts
import { OneSignalInit } from '@/components/OneSignalInit'
```

Then mount it in `<body>` — put it right after the `<ConsentMode />` line (it self-gates and renders `null`, so
placement is not sensitive):

```tsx
        {cfg.consentEnabled && <ConsentMode />}
        <OneSignalInit />
```

Leave the rest of the layout unchanged.

- [ ] **Step 4: Update `.env.example`**

Replace the two OneSignal lines (`# ONESIGNAL_APP_ID=` / `# ONESIGNAL_REST_API_KEY=`) with:

```
# Web push (OneSignal): set the PUBLIC app id (+ optional Safari web id) to enable — these
# are inlined at BUILD time, so rebuild after setting. REST key is only for SENDING (unused
# by the subscription widget; reserved).
# NEXT_PUBLIC_ONESIGNAL_APP_ID=
# NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID=
# ONESIGNAL_REST_API_KEY=
```

Leave the Meilisearch and Brevo lines untouched.

- [ ] **Step 5: Write the e2e spec**

Create `tests/e2e/push.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// e2e runs inert (no OneSignal config): the page must load NO OneSignal SDK, register NO
// OneSignal service worker, and render normally.
test.describe('OneSignal web push (inert)', () => {
  test('loads no OneSignal SDK and registers no OneSignal service worker when unconfigured', async ({
    page,
  }) => {
    const oneSignalRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('onesignal.com')) oneSignalRequests.push(r.url())
    })

    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    // Give any idle-scheduled load a chance to (not) fire.
    await page.waitForTimeout(1500)

    expect(oneSignalRequests).toEqual([])

    const oneSignalSwCount = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.filter((r) => (r.active?.scriptURL ?? '').includes('OneSignal')).length
    })
    expect(oneSignalSwCount).toBe(0)

    // Page still renders normally.
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })
})
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/components/OneSignalInit.tsx "src/app/(frontend)/layout.tsx" tests/e2e/push.e2e.spec.ts`
Expected: no errors.

- [ ] **Step 7: Build and confirm no regression**

Run: `npx pnpm@10.18.0 exec next build`
Expected: build succeeds; the homepage `/` stays static (`○`) — mounting the null-rendering client component
must not make it dynamic.

- [ ] **Step 8: Run the e2e (controller runs this)**

The controller starts a dev server on port 3000 and runs:
`npx pnpm@10.18.0 exec playwright test tests/e2e/push.e2e.spec.ts`
Expected: 1/1 pass — no `onesignal.com` request, no OneSignal service worker, homepage renders.

- [ ] **Step 9: Commit**

```bash
git add src/components/OneSignalInit.tsx public/OneSignalSDKWorker.js "src/app/(frontend)/layout.tsx" .env.example tests/e2e/push.e2e.spec.ts
git commit -m "feat(push): OneSignal init (lazy, inert) + service worker + layout + e2e"
```

---

## Verification (whole feature, inert)

- `npx pnpm@10.18.0 exec tsc --noEmit` + `eslint .` + `next build` all clean; homepage stays `○` static.
- Vitest: `tests/int/push.int.spec.ts` green (`pushEnabled()` false, `getPushConfig()` null).
- Playwright: `tests/e2e/push.e2e.spec.ts` green (no `onesignal.com` request, no OneSignal service worker, page
  renders).
- No OneSignal script or service worker loads without `NEXT_PUBLIC_ONESIGNAL_APP_ID`; nothing throws.

## Activation (later — out of this plan's automated run)

In OneSignal: create a Web Push app, configure its subscription prompt (and Safari web id if targeting Safari).
Set `NEXT_PUBLIC_ONESIGNAL_APP_ID` (+ `NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`) and **rebuild** (these are inlined at
build time). The SDK then loads on idle and OneSignal's prompt lets visitors subscribe. Sending campaigns is done
from the OneSignal dashboard.

---
*Plan for: docs/superpowers/specs/2026-07-07-phase-6-onesignal-push-design.md*
*Phase: 06-onesignal-push*
