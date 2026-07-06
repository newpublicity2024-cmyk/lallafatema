# Phase 5 — Consent / CMP — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-06
**Status:** Approved — ready for implementation plan.

## Goal

Add an in-house, RTL-Arabic **consent management platform (CMP)** to the public site. A cookie
consent banner lets visitors accept, reject, or granularly choose data categories; those choices
drive **Google Consent Mode v2** so ad-network (AdSense) and analytics scripts respect them.
Shown to every visitor (Morocco Law 09‑08 + GDPR). Zero-CLS, no third-party CMP script, fully
brand-styled. Consent is withdrawable at any time from a footer link.

Phase 5's ad *zones* (header, in-article, between-sections, footer) already shipped in the
dashboard work — this phase is **only the consent layer**. Sidebar / sticky / popup slots remain
deferred.

## Confirmed decisions

| Topic | Decision |
|---|---|
| CMP implementation | **In-house** lightweight banner + **Google Consent Mode v2** (no paid/third-party CMP, no Funding Choices). |
| Granularity | **Accept all / Reject all / Customize**. Customize exposes category toggles: Necessary (always on, disabled), Analytics, Advertising. |
| Geo scope | **Everyone** — no geo-detection. Consent defaults to `denied` until a choice is made. |
| Pre-consent behavior | **Cookieless default (Consent Mode v2)** — Google scripts load but run cookieless/anonymized until the visitor grants; upgraded via `gtag('consent','update')`. No hard-blocking of script injection. |
| Withdrawal | Persistent footer link (`إعدادات ملفات تعريف الارتباط`) reopens the preferences panel. |
| Top-of-site ad slot | **Reuse the existing `header` placement** (already renders above the hero). Verify/tidy only — no new placement. |
| Admin control | New **Consent** group in the `site-settings` global: `consentEnabled` master toggle + `privacyPolicyUrl`. Migration-driven (`push:false`). |

## Category → Consent Mode v2 signal mapping

| Category (UI) | Consent Mode v2 signals set on grant |
|---|---|
| Necessary (always on) | `functionality_storage: granted`, `security_storage: granted` (never gated) |
| Analytics | `analytics_storage` |
| Advertising | `ad_storage`, `ad_user_data`, `ad_personalization` |

Default (pre-choice and on Reject all): every gated signal `denied`.

## Current-state facts (verified against code)

- **Script injection is admin-driven and post-hydration.** `layout.tsx` renders
  `<SiteScripts headHtml={cfg.headScripts} bodyHtml={cfg.bodyScripts} />`, a client component that
  injects the admin blobs via `injectHtml` inside a `useEffect` (after hydration). The AdSense
  loader (`adsbygoogle.js`), GTM, and verification tags live in `headScripts`.
- **No `gtag` / `dataLayer` / Consent Mode exists yet** anywhere in `src/`. This phase introduces
  the first one. Because `SiteScripts` injects the Google loader *after* hydration, a
  `beforeInteractive` consent-default stub is guaranteed to run first — the ordering Consent Mode
  requires is naturally satisfied.
- **`analyticsId` (G-XXXX) is a Site Settings field but is NOT wired to load GA4** — nothing
  renders it. GA4 is not on the site. The Consent Mode stub is forward-compatible (if GA4 is wired
  later it will respect `analytics_storage`), but wiring GA4 is **out of scope** here.
- **Ad slots:** `<AdSlot>` renders `header` (layout, above hero), `in-article` (ArticleView),
  `between-sections` (homepage), `footer` (Footer). The `header` slot at `layout.tsx:61` already
  satisfies the "top of site before hero" requirement.
- **`getSiteConfig()`** (`src/lib/queries.ts`) returns a normalized `SiteConfig` merging the
  `site-settings` global over `src/lib/site.ts` constants as fallbacks — the DB-over-constants
  pattern all new fields follow. Currently surfaces `headScripts`, `bodyScripts`, `analyticsId`,
  `adsEnabled`, etc.
- **`SiteSettings` global** uses a single `tabs` field (الهوية / التواصل / التذييل / السكربتات /
  الإعلانات); `access: { read: anyone, update: isAdmin }`; hidden from journalists;
  `revalidateGlobalAfterChange` hook. New consent fields extend this global → migration.
- **`Footer`** is an async server component; adding a client reopen button means a small
  client-component child.
- **Migrations:** `push:false`. Additive SQL + a `payload_migrations` tracking row applied to Neon
  via the **Neon MCP** (project `icy-union-71150532`) — `payload migrate` is classifier-blocked as
  a prod write. Established pattern from Phase 4.

## Architecture

### 1. Consent core — `src/lib/consent.ts`

The single source of truth for consent shape, storage, and signal mapping (one testable module):

- `CONSENT_COOKIE = 'lf-consent'`, `CONSENT_VERSION = 1`, `CONSENT_MAX_AGE` = 180 days (seconds).
- `type ConsentCategories = { analytics: boolean; ads: boolean }` (necessary is implicit/always true).
- `type ConsentState = { v: number; analytics: boolean; ads: boolean }`.
- `encodeConsent(state) / decodeConsent(raw)` — compact string form, e.g. `1:a=1,ads=0`. `decode`
  returns `null` for absent/malformed/older-version values (older version ⇒ re-consent).
- `toConsentModeSignals(state | null)` — maps to the Consent Mode v2 object (all `denied` when
  `null`), used by both the stub and the update call. Keeps the category→signal mapping in one place.
- Pure, framework-free — unit-testable with Vitest.

### 2. Consent Mode stub — `src/components/ConsentMode.tsx`

A **static** raw inline `<script dangerouslySetInnerHTML>` (no props, identical on every page) mounted
as the **first child of `<body>`** in `layout.tsx`. It is in the initial HTML and executes at parse
time — before hydration, and therefore before `SiteScripts` injects the Google loader (that happens
in a post-hydration `useEffect`). The script itself **reads `document.cookie` inline** (client-side)
so the layout never calls `cookies()` and the site stays statically rendered / ISR (a core
non-negotiable — a `cookies()` call in the root layout would force every route dynamic).

The inline script:

1. `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}`
2. Reads the `lf-consent` cookie; if present+valid, derives granted/denied signals from it, else all
   gated signals `denied` with `wait_for_update: 500`.
3. `gtag('consent','default', <signals>)` — set synchronously so there's no denied→granted flicker
   for returning visitors.
4. `gtag('set','ads_data_redaction', <true while ad consent denied>)`.

Because the stub is static (no server data), it does not opt the page out of static rendering.

### 3. Consent banner + preferences — `src/components/ConsentBanner.tsx`

`'use client'`. Prop: `policyUrl` (from `getSiteConfig()` — static/ISR, not cookie-derived). Reads
the `lf-consent` cookie itself, **client-side in an effect** (renders `null` on the server to avoid a
hydration mismatch, then opens on mount when no valid cookie exists).

- Opens **only when no prior valid choice** exists in the cookie — or when reopened via event.
- Bottom `position: fixed` RTL bar (overlay ⇒ **zero CLS**), brand-styled (magenta `#bc0168`),
  Tajawal font inherited. Buttons: `قبول الكل` / `رفض الكل` / `تخصيص`. "Reject" is visually equal
  to "Accept" (compliance).
- **Customize** expands an inline panel/modal with toggles: Necessary (checked+disabled),
  Analytics, Advertising, plus `حفظ التفضيلات` (save). A "learn more" link → `policyUrl`.
- On any resolution (accept/reject/save): write the `lf-consent` cookie
  (`max-age=CONSENT_MAX_AGE; path=/; samesite=lax`), call
  `window.gtag('consent','update', toConsentModeSignals(state))` and
  `gtag('set','ads_data_redaction', !state.ads)`, then hide.
- Listens for a `lf:open-consent` window event to reopen with the current selections editable.
- Accessibility: `dir="rtl"`, `role="dialog"` + `aria-label`, native focusable buttons and
  `aria-label`led category toggles. **Note (as-built):** this is a *non-modal* bottom bar, not a
  blocking modal — so `aria-modal` and a focus trap are intentionally omitted (they'd be incorrect
  for a non-modal region that leaves the page interactive). There are no entrance animations, so
  `prefers-reduced-motion` is not applicable. Esc-to-collapse the Customize panel is deferred as a
  minor polish follow-up (does not block consent capture).

### 4. Reopen trigger — `src/components/CookieSettingsButton.tsx`

`'use client'`. A footer link/button labelled `إعدادات ملفات تعريف الارتباط` that dispatches
`window.dispatchEvent(new Event('lf:open-consent'))`. Enables consent withdrawal/change anytime
(GDPR "withdraw as easily as give"). Added to `Footer` (server component renders this client child).

### 5. Admin config — `src/globals/SiteSettings.ts` (+ migration)

New **الخصوصية والموافقة** (Privacy & Consent) tab (or group appended to الإعلانات):

- `consentEnabled` — checkbox, `defaultValue: true`. Master switch; when off, no banner/stub render
  (dev convenience, and lets the admin turn it off if a third-party CMP is ever adopted).
- `privacyPolicyUrl` — text, `defaultValue: '/privacy'`. The banner "learn more" target.

`getSiteConfig()` surfaces both with fallbacks (`consentEnabled: s.consentEnabled ?? true`,
`privacyPolicyUrl: s.privacyPolicyUrl || '/privacy'`) and `SiteConfig` type extended.

> ⚠️ **Dependency note:** the actual `/privacy` (privacy/cookies) page is **Phase 8** and currently
> 404s. The link points there now; the page content lands later. Expected, not a bug.

### 6. Wiring — `layout.tsx`

- **No `cookies()` call** — the cookie is read client-side (see §2/§3) so the layout stays static.
- When `cfg.consentEnabled`: render `<ConsentMode />` as the **first child of `<body>`** (before
  `<JsonLd>`/`<SiteScripts>`), and `<ConsentBanner policyUrl={cfg.privacyPolicyUrl} />` at the end of
  `<body>`.
- Header ad slot unchanged (already above hero).

## Data flow

```
Initial HTML (static/ISR)            On hydration                         On choice
─────────────────────────            ────────────                         ─────────
<ConsentMode> inline script:         <ConsentBanner> effect:              user clicks Accept/Reject/Save
  reads document.cookie                reads lf-consent cookie             → write lf-consent cookie
  gtag('consent','default',signals)    opens only when no valid cookie     → gtag('consent','update', signals)
  (denied+wait_for_update if none)                                         → ads_data_redaction = !ads
  ads_data_redaction while ad denied                                       → hide banner

   SiteScripts (post-hydration) injects adsbygoogle.js — already governed by the consent default
   Footer CookieSettingsButton → dispatch 'lf:open-consent' → banner reopens with current selections
```

## Files

| File | Change |
|---|---|
| `src/lib/consent.ts` | **New.** Cookie constants, `ConsentState`, encode/decode, `toConsentModeSignals`, `consentModeStubScript`, `readConsentCookie` |
| `tests/int/consent.int.spec.ts` | **New.** Vitest unit tests (matches the repo's `tests/int/**/*.int.spec.ts` include) |
| `tests/e2e/consent.e2e.spec.ts` | **New.** Playwright flow tests |
| `src/components/ConsentMode.tsx` | **New.** `beforeInteractive` default+hydrate stub |
| `src/components/ConsentBanner.tsx` | **New.** Client banner + Customize panel |
| `src/components/CookieSettingsButton.tsx` | **New.** Footer reopen trigger |
| `src/globals/SiteSettings.ts` | Add `consentEnabled` + `privacyPolicyUrl` → migration `add_consent_settings` |
| `src/lib/queries.ts` | `SiteConfig` + `getSiteConfig()` surface the two new fields w/ fallbacks |
| `src/app/(frontend)/layout.tsx` | Read cookie; mount `<ConsentMode>` (head, before SiteScripts) + `<ConsentBanner>` (body end) |
| `src/components/Footer.tsx` | Render `<CookieSettingsButton>` |
| Neon migration | Apply `add_consent_settings` additive SQL + `payload_migrations` row via Neon MCP |

## Verification

- `tsc --noEmit` + `eslint .` + `pnpm build` clean.
- Vitest: `consent.ts` encode/decode round-trips, rejects old version, correct signal mapping.
- Playwright (dev server, RTL):
  1. First visit (no cookie) → banner visible, brand-styled, RTL correct.
  2. **Accept all** → `lf-consent` cookie written with `a=1,ads=1`; banner hidden; `dataLayer`
     contains a `consent update` with all `granted`.
  3. Reload → banner does not reappear.
  4. Fresh session **Reject all** → cookie `a=0,ads=0`; `dataLayer` update all `denied`; no
     ad/analytics cookies present.
  5. **Customize** → toggle Analytics on / Ads off → save → cookie + signals match.
  6. Footer **إعدادات ملفات تعريف الارتباط** → banner reopens with current selections editable.
  7. Pre-choice: confirm no ad/analytics cookies set; `ads_data_redaction` true.
- Confirm zero CLS from the fixed banner and zero `/_next/image` requests unaffected.

## Out of scope (this phase)

- Sidebar, sticky/anchor, and popup ad slots — deferred (design decisions pending).
- Wiring GA4 from `analyticsId` — the stub is forward-compatible but GA4 loading is not added here.
- IAB TCF string / vendor list — not needed for an in-house AdSense-based setup.
- Gating **non-Google** trackers an admin pastes into `headScripts` — Consent Mode governs Google
  tags only; other trackers are the admin's responsibility (documented).
- The actual `/privacy` (privacy/cookies) policy page content — Phase 8.

## Deferred ideas (noted, not lost)

- Per-vendor granular consent / TCF certification — only if a non-Google ad network is added.
- Auto cookie-scanning — a third-party CMP feature we intentionally skipped.
- Sidebar/sticky/popup slots → a future ads sub-phase.

---
*Phase: 05-consent-cmp*
*Design gathered: 2026-07-06*
