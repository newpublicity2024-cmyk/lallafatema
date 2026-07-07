# Brevo Newsletter (env-gated inert) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a footer newsletter signup backed by Brevo double opt-in, built entirely env-gated inert (no credentials → the form renders, a submit returns a graceful "coming soon", nothing contacts Brevo) so it activates later with just env vars + a Brevo DOI template.

**Architecture:** One provider module (`src/lib/newsletter.ts`) owns all Brevo contact behind `newsletterEnabled()` (three vars). A `'use server'` action (`newsletter-action.ts`) wraps it with a honeypot; a small `'use client'` form (`NewsletterSignup`) uses `useActionState` for inline feedback and lives in the footer. A static `/newsletter/confirmed` page is Brevo's DOI redirect target. The Brevo API key is read only in the provider (server-side), never bundled to the client.

**Tech Stack:** Next.js 16 (App Router, React 19 `useActionState`, server actions), plain `fetch` to Brevo REST (no SDK), Payload CMS 3.85 (unchanged), Vitest (int), Playwright (e2e), Tailwind v4.

## Global Constraints

Every task's requirements implicitly include these (from the approved spec):

- **Env-gated inert is the contract.** `newsletterEnabled()` ⇔ **all three** of `BREVO_API_KEY`,
  `BREVO_LIST_ID`, `BREVO_DOI_TEMPLATE_ID` are set. When not enabled, `subscribe()` returns
  `{ status: 'disabled' }` **before any `fetch`**, and **never throws**. The build and the footer render
  normally without credentials.
- `subscribe()` never throws into callers: a Brevo/network error is caught → `{ status: 'error' }` (never a
  500). Order inside `subscribe`: disabled-check **first**, then email validation, then the Brevo call.
- **Double opt-in only:** `POST https://api.brevo.com/v3/contacts/doubleOptinConfirmation` with
  `includeListIds`, `templateId`, `redirectionUrl = `${SITE_URL}/newsletter/confirmed``. Brevo sends the
  confirm email; the contact joins the list on click.
- **API key is server-only.** It is read only in `src/lib/newsletter.ts`, reached only via the `'use server'`
  action — never a `NEXT_PUBLIC_` var, never imported into a client component.
- **The form always renders** (so the inert build shows real UI); the disabled state manifests on submit
  (matches how `/search` behaves inert). Reading `process.env` in a server component does not force dynamic
  rendering — the footer/layout stay ISR-friendly; `/newsletter/confirmed` is static and `noIndex`.
- **No schema changes**, **no new npm dependency** (use `fetch`). RTL Arabic copy exactly as written here.
- pnpm is invoked as **`npx pnpm@10.18.0`**.

---

### Task 1: Provider + inert unit tests

**Files:**
- Create: `src/lib/newsletter.ts`
- Test: `tests/int/newsletter.int.spec.ts`

**Interfaces:**
- Consumes: `SITE_URL` from `@/lib/seo`.
- Produces (used by later tasks): `newsletterEnabled(): boolean`, `isValidEmail(email: string): boolean`,
  `subscribe(email: string): Promise<SubscribeResult>`, `type SubscribeResult = { status: 'ok' | 'invalid' | 'error' | 'disabled' }`.

- [ ] **Step 1: Write the failing test**

Create `tests/int/newsletter.int.spec.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'

import { isValidEmail, newsletterEnabled, subscribe } from '@/lib/newsletter'

// Every suite in this file runs WITHOUT Brevo credentials → verifies the inert
// contract: the provider never contacts Brevo and never throws when disabled.
// Top-level beforeAll so later-appended suites (the action tests) are covered too.
beforeAll(() => {
  delete process.env.BREVO_API_KEY
  delete process.env.BREVO_LIST_ID
  delete process.env.BREVO_DOI_TEMPLATE_ID
})

describe('newsletter provider (inert without credentials)', () => {
  it('is disabled when the Brevo env vars are absent', () => {
    expect(newsletterEnabled()).toBe(false)
  })

  it('subscribe returns { status: "disabled" } without contacting Brevo', async () => {
    await expect(subscribe('reader@example.com')).resolves.toEqual({ status: 'disabled' })
  })

  it('validates email format', () => {
    expect(isValidEmail('reader@example.com')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/newsletter.int.spec.ts`
Expected: FAIL — cannot resolve `@/lib/newsletter`.

- [ ] **Step 3: Implement the provider**

Create `src/lib/newsletter.ts`:

```ts
import { SITE_URL } from './seo'

export type SubscribeResult = { status: 'ok' | 'invalid' | 'error' | 'disabled' }

/** Newsletter is enabled only when all three Brevo (double-opt-in) vars are set. */
export function newsletterEnabled(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID && process.env.BREVO_DOI_TEMPLATE_ID,
  )
}

/** Dependency-free email sanity check (not full RFC — just rejects obvious junk). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Subscribe an email via Brevo double opt-in: Brevo sends the confirmation email
 * and the contact joins the list only when they click it. Order matters — the
 * disabled short-circuit is first so nothing is sent when unconfigured. Never throws;
 * a Brevo/network failure degrades to { status: 'error' }, never a 500.
 */
export async function subscribe(email: string): Promise<SubscribeResult> {
  if (!newsletterEnabled()) return { status: 'disabled' }
  const clean = email.trim().toLowerCase()
  if (!isValidEmail(clean)) return { status: 'invalid' }
  try {
    const res = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email: clean,
        includeListIds: [Number(process.env.BREVO_LIST_ID)],
        templateId: Number(process.env.BREVO_DOI_TEMPLATE_ID),
        redirectionUrl: `${SITE_URL}/newsletter/confirmed`,
      }),
    })
    return { status: res.ok ? 'ok' : 'error' }
  } catch {
    return { status: 'error' }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/newsletter.int.spec.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/newsletter.ts tests/int/newsletter.int.spec.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/newsletter.ts tests/int/newsletter.int.spec.ts
git commit -m "feat(newsletter): Brevo double-opt-in provider (env-gated inert) + unit tests"
```

---

### Task 2: Server action + client form + footer wiring

**Files:**
- Create: `src/lib/newsletter-action.ts`
- Create: `src/components/NewsletterSignup.tsx`
- Modify: `src/components/Footer.tsx`
- Test: `tests/int/newsletter.int.spec.ts` (append an action suite)

**Interfaces:**
- Consumes: `subscribe`, `SubscribeResult` from `@/lib/newsletter` (Task 1).
- Produces: `subscribeAction(prev: SignupState, formData: FormData): Promise<SignupState>` and
  `type SignupState = SubscribeResult | { status: 'idle' }` (from `newsletter-action.ts`);
  `<NewsletterSignup />` (default-styled footer form).

- [ ] **Step 1: Write the failing test**

In `tests/int/newsletter.int.spec.ts`, add this import to the **top import group**:

```ts
import { subscribeAction } from '@/lib/newsletter-action'
```

Then append this `describe` block at the **end** of the file:

```ts
describe('subscribeAction (inert without credentials)', () => {
  it('honeypot: a filled "company" field returns ok without subscribing', async () => {
    const fd = new FormData()
    fd.set('company', 'bot corp')
    fd.set('email', 'bot@example.com')
    await expect(subscribeAction({ status: 'idle' }, fd)).resolves.toEqual({ status: 'ok' })
  })

  it('a valid email while disabled returns disabled', async () => {
    const fd = new FormData()
    fd.set('email', 'reader@example.com')
    await expect(subscribeAction({ status: 'idle' }, fd)).resolves.toEqual({ status: 'disabled' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/newsletter.int.spec.ts`
Expected: FAIL — cannot resolve `@/lib/newsletter-action`.

- [ ] **Step 3: Implement the server action**

Create `src/lib/newsletter-action.ts`:

```ts
'use server'

import { subscribe, type SubscribeResult } from './newsletter'

export type SignupState = SubscribeResult | { status: 'idle' }

/**
 * Footer newsletter form action. Honeypot: bots fill the hidden `company` field,
 * humans leave it empty — a filled honeypot silently "succeeds" without calling Brevo.
 * The Brevo API key lives in `subscribe` (server-only); this module is `'use server'`,
 * so the client only receives an RPC stub.
 */
export async function subscribeAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  if (String(formData.get('company') ?? '').trim() !== '') return { status: 'ok' }
  const email = String(formData.get('email') ?? '')
  return subscribe(email)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/newsletter.int.spec.ts`
Expected: PASS (5/5 — 3 provider + 2 action).

- [ ] **Step 5: Implement the client form**

Create `src/components/NewsletterSignup.tsx`:

```tsx
'use client'

import { useActionState } from 'react'

import { subscribeAction, type SignupState } from '@/lib/newsletter-action'

const MESSAGES: Record<Exclude<SignupState['status'], 'idle'>, string> = {
  ok: 'تفقّد بريدك الإلكتروني لتأكيد الاشتراك.',
  invalid: 'يرجى إدخال بريد إلكتروني صحيح.',
  error: 'تعذّر الاشتراك، حاول مرّة أخرى.',
  disabled: 'النشرة ستتوفر قريبًا.',
}

const INITIAL: SignupState = { status: 'idle' }

export function NewsletterSignup() {
  const [state, action, pending] = useActionState(subscribeAction, INITIAL)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h4 className="font-bold text-zinc-900">النشرة البريدية</h4>
      <p className="mt-1 text-sm text-zinc-600">اشترك لتصلك أحدث المقالات في بريدك.</p>
      <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
        {/* Honeypot — hidden from users, catches bots. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <input
          type="email"
          name="email"
          required
          placeholder="بريدك الإلكتروني"
          aria-label="بريدك الإلكتروني"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? '…' : 'اشترك'}
        </button>
      </form>
      {state.status !== 'idle' && (
        <p className="mt-2 text-sm text-zinc-600">{MESSAGES[state.status]}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire into the footer**

In `src/components/Footer.tsx`, add the import next to the other component imports:

```ts
import { NewsletterSignup } from './NewsletterSignup'
```

Then insert the signup block between the `<AdSlot placement="footer" … />` line and the
`<div className="lf-container grid …">` columns block:

```tsx
      {/* Newsletter signup — renders inert (graceful) without Brevo creds. */}
      <div className="lf-container pt-6">
        <NewsletterSignup />
      </div>
```

Leave the rest of the footer (columns grid, copyright, `CookieSettingsButton`) unchanged.

- [ ] **Step 7: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/newsletter-action.ts src/components/NewsletterSignup.tsx src/components/Footer.tsx tests/int/newsletter.int.spec.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/newsletter-action.ts src/components/NewsletterSignup.tsx src/components/Footer.tsx tests/int/newsletter.int.spec.ts
git commit -m "feat(newsletter): footer signup form + server action (honeypot, inert)"
```

---

### Task 3: Confirmation page + env docs + e2e

**Files:**
- Create: `src/app/(frontend)/newsletter/confirmed/page.tsx`
- Modify: `.env.example`
- Test: `tests/e2e/newsletter.e2e.spec.ts`

**Interfaces:**
- Consumes: `buildMetadata` from `@/lib/seo`; `<NewsletterSignup />` in the footer (Task 2).

- [ ] **Step 1: Implement the confirmation page**

Create `src/app/(frontend)/newsletter/confirmed/page.tsx`:

```tsx
import type { Metadata } from 'next'

import { buildMetadata } from '@/lib/seo'

export const metadata: Metadata = buildMetadata({
  title: 'تم تأكيد الاشتراك',
  path: '/newsletter/confirmed',
  noIndex: true,
})

export default function NewsletterConfirmedPage() {
  return (
    <div className="lf-container py-16 text-center">
      <h1 className="text-3xl font-bold text-zinc-900">تم تأكيد اشتراكك 🎉</h1>
      <p className="mt-4 text-zinc-600">
        شكرًا لاشتراكك في نشرة لالة فاطمة البريدية. ستصلك أحدث المقالات قريبًا.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Document the env vars**

In `.env.example`, under the `# ── Phase 6: integrations ──` block, replace the two bare Brevo lines
(`# BREVO_API_KEY=` / `# BREVO_LIST_ID=`) with a commented group that adds the DOI template id:

```
# Newsletter (Brevo double opt-in): set ALL THREE to enable the footer signup.
# BREVO_API_KEY=
# BREVO_LIST_ID=
# BREVO_DOI_TEMPLATE_ID=
```

Leave the Meilisearch and OneSignal lines untouched.

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/newsletter.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// e2e runs inert (no Brevo credentials): the footer form must render, and submitting
// must show the graceful "coming soon" state — nothing contacts Brevo.
test.describe('Newsletter signup', () => {
  test('footer form renders and submitting shows the disabled notice', async ({ page }) => {
    await page.goto(BASE)

    // Dismiss the consent banner (a fixed bottom-of-viewport overlay shown to fresh
    // visitors — Phase 5) so it doesn't cover the footer form.
    const reject = page.getByRole('button', { name: 'رفض الكل' })
    if (await reject.isVisible().catch(() => false)) await reject.click()

    const email = page.getByLabel('بريدك الإلكتروني')
    await email.scrollIntoViewIfNeeded()
    await expect(email).toBeVisible()

    await email.fill('reader@example.com')
    await page.getByRole('button', { name: 'اشترك' }).click()

    await expect(page.getByText('النشرة ستتوفر قريبًا.')).toBeVisible()
  })
})
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint "src/app/(frontend)/newsletter/confirmed/page.tsx" tests/e2e/newsletter.e2e.spec.ts`
Expected: no errors.

- [ ] **Step 5: Build and confirm route rendering**

Run: `npx pnpm@10.18.0 exec next build`
Expected: build succeeds; `/newsletter/confirmed` is static (`○`); the homepage and other static routes are
unchanged (adding a client component to the footer must NOT make them dynamic). If `/newsletter/confirmed`
is `ƒ`, that's a defect (it has no dynamic APIs).

- [ ] **Step 6: Run the e2e (controller runs this)**

The controller starts a dev server on port 3000 and runs:
`npx pnpm@10.18.0 exec playwright test tests/e2e/newsletter.e2e.spec.ts`
Expected: 1/1 pass — the footer form renders, and submitting shows "النشرة ستتوفر قريبًا.".

- [ ] **Step 7: Commit**

```bash
git add "src/app/(frontend)/newsletter/confirmed/page.tsx" .env.example tests/e2e/newsletter.e2e.spec.ts
git commit -m "feat(newsletter): DOI confirmation page, env docs, and e2e"
```

---

## Verification (whole feature, inert)

- `npx pnpm@10.18.0 exec tsc --noEmit` + `eslint .` + `next build` all clean.
- `/newsletter/confirmed` builds static (`○`); the footer's client form does not make static routes dynamic.
- Vitest: `tests/int/newsletter.int.spec.ts` green (provider inert contract + email validation + action honeypot/disabled).
- Playwright: `tests/e2e/newsletter.e2e.spec.ts` green (footer form renders; submit → graceful disabled notice).
- The Brevo API key never appears in any client bundle (read only in `src/lib/newsletter.ts`, reached via the `'use server'` action).

## Activation (later — out of this plan's automated run)

In Brevo: create a double-opt-in email template (note its id) and a contact list. Set `BREVO_API_KEY` +
`BREVO_LIST_ID` + `BREVO_DOI_TEMPLATE_ID`. Submitting the footer form then sends a confirmation email whose
link adds the contact to the list and redirects to `/newsletter/confirmed`. No code change.

---
*Plan for: docs/superpowers/specs/2026-07-07-phase-6-brevo-newsletter-design.md*
*Phase: 06-brevo-newsletter*
