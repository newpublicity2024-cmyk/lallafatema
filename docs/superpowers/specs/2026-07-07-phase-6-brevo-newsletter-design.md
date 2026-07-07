# Phase 6 (sub-project 4) — Brevo Newsletter (env-gated inert) — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-07
**Status:** Approved — ready for implementation plan.

## Goal

Add a **newsletter signup** in the footer, backed by **Brevo** with **double opt-in**, built **env-gated
inert**: with no Brevo credentials the footer form renders and the app builds/serves normally, and a submit
returns a graceful "coming soon" — nothing ever contacts Brevo. When the three env vars are set (and a Brevo
DOI template exists), it activates with no code change.

This is sub-project 4 of Phase 6 (siblings: magazine archive [done], per-video watch pages [done],
Meilisearch search [done], OneSignal push [next]). This spec covers **only** the Brevo newsletter.
**No schema changes** — subscribers live in Brevo, not our DB.

## Confirmed decisions

| Topic | Decision |
|---|---|
| Placement | **Footer only** — one reusable signup block in the footer (visible site-wide). No article CTA / dedicated page in v1 (both can be added later behind the same provider). |
| Opt-in | **Double opt-in** — Brevo emails a confirmation link; the contact joins the list only on click. GDPR-friendly, consistent with the site's consent-first build (Consent Mode v2). |
| Activation model | **Env-gated inert.** `BREVO_API_KEY` + `BREVO_LIST_ID` + **`BREVO_DOI_TEMPLATE_ID`** all set → enabled; otherwise `subscribe()` is a no-op returning `disabled`. |
| Transport | **Plain `fetch`** to Brevo's REST API — no SDK/npm dependency (one POST). |
| Submission | **Server action** (`'use server'`) driving a small client form via `useActionState` — API key stays server-only; works without JS (the action still runs; the DOI email is the real confirmation). |
| Schema changes | **None.** |

## Current-state facts (verified against code)

- **No newsletter component exists** (grep for newsletter/Brevo/اشترك found only `ShareButtons.tsx`).
- **`Footer.tsx`** is an async server component: an `<AdSlot placement="footer">` then a
  `lf-container grid ... lg:grid-cols-4` with four blocks (identity+social / الأقسام / روابط / شبكة NewPub),
  then a copyright row with the `<CookieSettingsButton>`. It reads `getSiteConfig()` — the layout renders it
  on every page under ISR.
- **`.env.example:33-34`** already reserves `# BREVO_API_KEY=` / `# BREVO_LIST_ID=` (commented). It does **not**
  reserve a DOI template id — double opt-in needs one, so we add `# BREVO_DOI_TEMPLATE_ID=`.
- **`SITE_URL`** is exported from `src/lib/seo.ts` (`NEXT_PUBLIC_SERVER_URL` → `https://lallafatema.ma`
  fallback); reuse it for the DOI `redirectionUrl`. `buildMetadata({ …, noIndex })` is available for the
  confirmation page.
- Next 16 ⇒ React 19: `useActionState` (with a `pending` flag) is available; `<form action={serverAction}>`
  is progressively enhanced (runs without JS).
- Reading `process.env` in a Server Component does **not** force dynamic rendering (only
  `cookies()`/`headers()`/`searchParams` do) — so the footer stays ISR-friendly.

## Architecture

### 1. Provider — `src/lib/newsletter.ts` (new)

The only module that ever contacts Brevo.

- `newsletterEnabled(): boolean` → `Boolean(BREVO_API_KEY && BREVO_LIST_ID && BREVO_DOI_TEMPLATE_ID)`.
- `isValidEmail(email): boolean` → a simple, dependency-free `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` check.
- `type SubscribeResult = { status: 'ok' | 'invalid' | 'error' | 'disabled' }`.
- `subscribe(email): Promise<SubscribeResult>`:
  - trims/lowercases; **disabled check first** → `{status:'disabled'}` (no fetch) when not enabled;
  - then `isValidEmail` → `{status:'invalid'}`;
  - else `POST https://api.brevo.com/v3/contacts/doubleOptinConfirmation` with headers
    `api-key: BREVO_API_KEY`, and body `{ email, includeListIds:[Number(BREVO_LIST_ID)],
    templateId:Number(BREVO_DOI_TEMPLATE_ID), redirectionUrl:`${SITE_URL}/newsletter/confirmed` }`;
    `res.ok → {status:'ok'}` else `{status:'error'}`; any thrown/network error → `{status:'error'}`.
  - **Never throws.** The API key is only read here (server-side).

### 2. Server action — `src/lib/newsletter-action.ts` (new, `'use server'`)

- `type SignupState = SubscribeResult | { status: 'idle' }`.
- `subscribeAction(prev: SignupState, formData: FormData): Promise<SignupState>`:
  - **Honeypot:** if the hidden `company` field is non-empty (a bot), return `{status:'ok'}` without calling
    Brevo.
  - else read `email` from `formData` and return `subscribe(email)`.
- Being a `'use server'` module, its code runs on the server; the client only gets an RPC stub, so
  `newsletter.ts` (and the API key) never enters the client bundle.

### 3. Signup form — `src/components/NewsletterSignup.tsx` (new, `'use client'`)

- `useActionState(subscribeAction, { status:'idle' })` → `[state, action, pending]`.
- Renders a heading ("النشرة البريدية") + blurb, then `<form action={action}>` with: a **hidden honeypot**
  `company` input, a `required` `type="email"` input (`aria-label="بريدك الإلكتروني"`), and a submit button
  ("اشترك", disabled while `pending`). Below, when `state.status !== 'idle'`, a message keyed by status:
  - `ok` → "تفقّد بريدك الإلكتروني لتأكيد الاشتراك."
  - `invalid` → "يرجى إدخال بريد إلكتروني صحيح."
  - `error` → "تعذّر الاشتراك، حاول مرّة أخرى."
  - `disabled` → "النشرة ستتوفر قريبًا."
- **The form always renders** (so the inert build shows real UI); the disabled state manifests only on submit
  (mirrors how `/search` behaves inert). With JS you stay on the page with inline feedback; without JS the
  form still posts and the action runs.

### 4. Footer wiring — `src/components/Footer.tsx`

Render `<NewsletterSignup />` as a distinct block in the footer, above the existing link-columns grid
(a bordered signup box in `.lf-container`), so it's prominent without squeezing the four columns.

### 5. Confirmation page — `src/app/(frontend)/newsletter/confirmed/page.tsx` (new)

A small **static** (`○`) page — Brevo's DOI `redirectionUrl` target after the user clicks the confirm link:
"تم تأكيد اشتراكك" + a thank-you line. `metadata = buildMetadata({ title, path:'/newsletter/confirmed',
noIndex:true })` (thin landing → noindex).

### 6. Env

`.env.example`: add `# BREVO_DOI_TEMPLATE_ID=` next to the two existing Brevo vars, with a one-line note that
all three are required to enable double-opt-in signup.

## Files

| File | Change |
|---|---|
| `src/lib/newsletter.ts` | **New** — env-gate + `subscribe` (fetch → Brevo DOI) + `isValidEmail` |
| `src/lib/newsletter-action.ts` | **New** — `'use server'` `subscribeAction` (+ honeypot) |
| `src/components/NewsletterSignup.tsx` | **New** — client form + `useActionState` feedback |
| `src/components/Footer.tsx` | Render `<NewsletterSignup />` above the link columns |
| `src/app/(frontend)/newsletter/confirmed/page.tsx` | **New** — DOI landing (static, noIndex) |
| `.env.example` | Add `BREVO_DOI_TEMPLATE_ID` + note |
| `tests/int/newsletter.int.spec.ts` | **New** — inert: `newsletterEnabled()` false, `subscribe()`→`disabled` (no fetch), `isValidEmail` cases, `subscribeAction` honeypot→`ok` + disabled→`disabled` |
| `tests/e2e/newsletter.e2e.spec.ts` | **New** — footer form renders; fill+submit → "النشرة ستتوفر قريبًا." |

## Verification

**Inert (no Brevo env — the state everything is verified in):**
- `tsc --noEmit` + `eslint .` + `next build` clean; homepage/footer stay `○` static, `/newsletter/confirmed`
  is `○` static.
- Unit (Vitest): `newsletterEnabled()` → false; `subscribe('a@b.com')` → `{status:'disabled'}` (no network);
  `isValidEmail` accepts `a@b.co`, rejects `nope`/``; `subscribeAction` with the honeypot filled → `{status:'ok'}`,
  and with a valid email while disabled → `{status:'disabled'}`.
- Playwright (dev server, RTL, no creds): the footer newsletter form renders; filling an email + submitting
  shows "النشرة ستتوفر قريبًا."; no crash; the API key never appears in client output.

**Activation (later — out of this sub-project's automated run):** in Brevo, create a double-opt-in email
template (note its id) and a contact list; set `BREVO_API_KEY` + `BREVO_LIST_ID` + `BREVO_DOI_TEMPLATE_ID`;
submitting the footer form then sends a confirmation email whose link adds the contact to the list and
redirects to `/newsletter/confirmed`. No code change.

## Out of scope (this sub-project)

- Article/inline signup CTAs, a dedicated `/newsletter` page, exit-intent modals (all extend the same
  provider later).
- Storing subscribers in our own DB, unsubscribe UI (Brevo hosts both), sending campaigns.
- Rate limiting beyond the honeypot (Brevo's DOI already blocks unconfirmed contacts); add a stronger limiter
  only if abuse appears.
- Provisioning the Brevo account / DOI template / list — credential-gated; the user does this at activation.
- OneSignal push — a separate Phase 6 sub-project.

## Deferred ideas (noted, not lost)

- End-of-article signup CTA (higher conversion) behind the same `subscribe()` provider.
- Personalized welcome/first-issue automation in Brevo.
- A `/newsletter` archive/landing page if the newsletter grows into a standalone product.

---
*Phase: 06-brevo-newsletter*
*Design gathered: 2026-07-07*
