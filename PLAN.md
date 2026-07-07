# PLAN.md — Lalla Fatema Magazine Rebuild

## Context

We are rebuilding **lallafatema.ma** — an Arabic, right-to-left (RTL) lifestyle & celebrity magazine for Moroccan women — replacing its WordPress/Elementor stack with a **Next.js (App Router) + Tailwind + Payload CMS 3** application. The functional scope = the original site's full feature set; the design/layout = the glossy magazine style of **layalina.com** (primary) and **foochia.com** (secondary).

The build is split in two: a fast, SEO-strong, image-heavy **public magazine** and an **editorial dashboard (Payload CMS)** where journalists publish and an admin controls everything on the site (sliders, panels, section ordering, ads, magazine issues).

**Working mode:** plan heavily, execute in small verifiable steps. Ship a rough-but-working v1 of each phase against the real stack, then iterate. Check in at the end of each phase before moving on.

## Confirmed decisions

| Topic | Decision |
|---|---|
| **Database** | **Neon Postgres, manual setup** — user creates the Neon project + branches and provides `DATABASE_URL`(s); Payload's Postgres adapter is wired to it. |
| **Search** | **Meilisearch** (managed cloud), indexed on publish. |
| **Layalina extras** (horoscopes, calculators, dream interpretation) | **Deferred** — out of v1. |
| **Comments** | **Skipped.** |
| **Media / images** | **Cloudflare R2 + Cloudflare Image Transformations** (user-provisioned credentials). |
| **Newsletter** | **Brevo** (behind a thin provider interface). |
| **Web push** | **OneSignal.** |

## External prerequisites (gating items, requested just-in-time)

1. **Neon** — production `DATABASE_URL` + a `preview`/`dev` branch URL. *(Phase 0/1)*
2. **Cloudflare** — account, R2 bucket + S3 credentials, image hostname (e.g. `images.lallafatema.ma`), Image Transformations enabled. *(Phase 1)*
3. **Meilisearch** — instance URL + API keys. *(Phase 6)*
4. **Brevo** — API key + list ID. *(Phase 6)*
5. **OneSignal** — app ID + REST API key + safari web ID. *(Phase 6)*
6. **Domain / DNS** — access to `lallafatema.ma` DNS. *(Phase 8)*
7. **Migration inputs** — WordPress export + Search Console/Analytics access. *(Phase 7)*

## Architecture at a glance

- Single repo, single Vercel deploy. Payload CMS 3 runs inside the Next.js App Router app. Payload's Postgres adapter → Neon; Payload owns the schema and migrations. Frontend reads via Payload's Local API where possible.
- Media uploads stream to R2 via Payload's S3 adapter; DB stores only references.
- `next/image` uses a custom loader so resized URLs point at Cloudflare's edge — Vercel's `/_next/image` is never used.
- Mostly static (ISR), revalidated on publish via a secret-protected endpoint triggered by a Payload `afterChange` hook.
- Cloudflare in front of Vercel (WAF/bot/DDoS + cache), wired at hardening/cutover.

## Phased execution plan

Each phase ends with a working, deployed-to-preview increment and a check-in.

- **Phase 0 — Scaffold & infra baseline.** Repo, Next.js + Tailwind + Payload bootstrap, Payload↔Neon, Vercel project + env, RTL + Arabic font baseline, CI. *(Domains: infra/ops, RTL baseline)*
  - **Status:** done except the Vercel deploy. The Vercel MCP is currently authenticated to the wrong account ("mfm sport's projects"); **Vercel project creation + env vars + first deploy are DEFERRED** until the correct Vercel account is connected. Until then we develop and verify locally against the Neon DB.
- **Phase 1 — Data model + media pipeline.** Payload collections (Posts, Categories[hierarchical], Tags, Users/Authors, Media, MagazineIssues, Videos, Pages) + globals (Homepage layout, Menus, Ads); roles/access control; R2 storage adapter; custom image loader (verify Vercel optimizer bypassed). *(Domains: content model, media pipeline)*
- **Phase 2 — Core public site.** Homepage (static structure), category pages, article page, author pages — RTL, ISR, LCP/CLS/INP discipline, a11y, design language from references. *(Domains: rendering/perf, RTL, a11y, partial SEO)*
- **Phase 3 — Editorial / curation layer.** Homepage builder (pin posts into slider/panels), menu/mega-menu management, live preview, drafts/versions, scheduling, autosave, on-publish revalidation. *(Domains: globals, CMS UX)*
- **Phase 4 — SEO & distribution.** Metadata + canonical, OG/Twitter, per-article SEO overrides, JSON-LD (Article/NewsArticle, BreadcrumbList, Organization, WebSite+SearchAction, Recipe, VideoObject), sitemaps (incl. Google News) + RSS, stable `slug-<id>`, related articles. *(Domain: SEO)*
  - **Status: DONE [2026-07-01].** Central `src/lib/seo.ts` (SITE_URL resolver → `https://lallafatema.ma` fallback, `absoluteUrl`, `ogImageUrl`, `buildMetadata`, JSON-LD builders) + `<JsonLd>`. Per-page metadata (canonical/OG/Twitter/robots) on article/category/author/homepage + `metadataBase` in layout. JSON-LD: Organization+WebSite site-wide; NewsArticle+BreadcrumbList (+Recipe when `isRecipe`) on articles; BreadcrumbList on categories; VideoObject on the homepage video band. Route handlers: `/sitemap.xml`, `/news-sitemap.xml` (Google News, last 48h), `/rss.xml`, `/llms.txt` (AI visibility) + `robots.ts` (welcomes AI crawlers). Category SEO fields added (migration `add_category_seo`). 301 groundwork: admin-editable **Redirects** collection (migration `add_redirects`) served by `src/middleware.ts` via cached `/redirects-map.json` (exact-path; verified 301 e2e). Related articles confirmed (already wired). Both migrations applied to Neon. Verified: tsc+eslint+build clean, all feeds curl-checked, article JSON-LD valid (5/5 blocks parse), 0 `/_next/image`. **Deferred:** WebSite `SearchAction` + per-video watch pages → Phase 6; bulk WordPress redirect map + sitemap pagination → Phase 7. **Follow-up:** Next 16.2.6 renamed the `middleware` file convention to `proxy` (deprecation warning only — still works).
- **Phase 5 — Ads & consent.** Ad zones (header, in-article, between-cards, sidebar, sticky), lazy-loaded + height-reserved; dashboard ads management (programmatic + house ads); CMP. *(Domains: ads, consent)*
  - **Status: DONE [2026-07-06].** Ad zones (header/in-article/between-sections/footer), the Ads collection + `<AdSlot>` (height-reserved, zero-CLS) and dashboard ads management shipped earlier with the dashboard work; the "top-of-site before hero" slot reuses the existing `header` zone. This phase delivered the **CMP/consent layer**: in-house RTL banner + **Google Consent Mode v2** (`src/lib/consent.ts`, `ConsentMode`/`ConsentBanner`/`CookieSettingsButton`), shown to everyone, category-granular (Necessary/Analytics/Advertising → the 4 CM v2 signals), cookieless-default before choice, withdrawable from the footer; admin `consentEnabled` + `privacyPolicyUrl` in Site Settings (migration `add_consent_settings`, Neon batch 8). Cookie read client-side → ISR preserved. Verified: unit 10/10, e2e 4/4, build clean; opus review merge-ready. Spec+plan in `docs/superpowers/`. This also satisfies Phase 8's "cookie consent (Law 09-08 + GDPR)" item — only the Privacy/Terms/Cookies **pages** remain there. **Deferred:** `sidebar`/`sticky`/`popup` ad zones (no design home yet — need a design decision); Esc-to-collapse the consent panel (minor a11y polish).
- **Phase 6 — Genre features.** Meilisearch search, magazine archive (PDF viewer + download), video facades + VideoObject, Brevo newsletter, OneSignal push. *(Domain: search + genre features)*
  - **Status: DONE [2026-07-07].** Decomposed into 5 independent sub-projects (each its own spec+plan in `docs/superpowers/`), all built and merged to `main` locally. The three credential-gated ones (Meilisearch search, Brevo newsletter, OneSignal push) were built **env-gated inert** — they ship as safe no-ops with graceful UI and activate when the user provides credentials (see each sub-project's Activation notes; no code changes needed except the small documented enabled-path follow-ups). **DONE [2026-07-06] — Magazine archive:** public `/magazine` cover grid + `/magazine/[issueNumber]` detail with a cover-facade→native `<iframe>` PDF viewer (loads only on click — CWV-safe) + download; `PublicationIssue` JSON-LD, sitemap entries, "المجلة" nav item; no schema changes (reused the existing `magazine-issues` collection); demo issue #999 seeded. Verified (unit 4/4, e2e 1/1, build clean) and merged to `main` locally. **DONE [2026-07-07] — Per-video watch pages + VideoObject:** `/videos/[slugId]` watch pages (facade→iframe player; VideoObject moved off the homepage onto each page; same-category related rail; sitemap entries); cards link out instead of playing inline; no schema changes; verified (unit 11/11, e2e 1/1, build clean) and merged locally. *Content follow-up: seeded videos lack thumbnails → add them so VideoObject earns rich results.* **DONE [2026-07-07] — Meilisearch search (built env-gated inert):** server `/search?q=` page (GET form + `PostCard` results + graceful "coming soon" disabled state, `noIndex`); `src/lib/search.ts` provider (every call a no-op/empty without `MEILISEARCH_*`, lazy client, errors swallowed on the publish path); index-on-publish hook that **reconciles from the published DB state** (autosave-safe — never evicts a live post); `getPostsByIds` (order-preserving); backfill script `src/seed/reindex.ts`; `meilisearch` dep. Verified fully **inert** (unit 9/9, e2e 2/2, build clean, `/search` ƒ + `/` ○, robots noindex, 0 `/_next/image`); opus whole-branch review + focused fix re-review both clean; merged locally. **Activation follow-up (when creds land):** set `MEILISEARCH_HOST`+`MEILISEARCH_API_KEY`, run `tsx src/seed/reindex.ts`, and add a live-Meilisearch regression test asserting autosave-of-a-published-post leaves it indexed. **DONE [2026-07-07] — Brevo newsletter (built env-gated inert):** footer signup (`NewsletterSignup` client form via `useActionState` + `'use server'` `subscribeAction`, honeypot, `aria-live` status region) backed by `src/lib/newsletter.ts` — double opt-in via Brevo's `doubleOptinConfirmation` REST endpoint (`fetch`, **no SDK/dependency**); `subscribe()` returns `disabled`/no-op without the three Brevo vars, never throws, and the API key is **server-only** (verified 0 leak to client). Static `/newsletter/confirmed` DOI landing (`noIndex`); `BREVO_DOI_TEMPLATE_ID` added to `.env.example`. No schema changes. Verified fully **inert** (unit 5/5, e2e 1/1, build clean, `/newsletter/confirmed` ○, homepage ○); opus whole-branch review merge-ready; merged locally. **Activation (when creds land):** create a Brevo double-opt-in template + a contact list, set `BREVO_API_KEY`+`BREVO_LIST_ID`+`BREVO_DOI_TEMPLATE_ID`; follow-up: log non-2xx Brevo response bodies server-side for diagnosability. **DONE [2026-07-07] — OneSignal web push (built env-gated inert, CWV-first):** visitors opt in via OneSignal's built-in prompt; `OneSignalInit` lazily loads the SDK **only on idle** (off the critical path, `async`, renders `null` → zero CLS) when `NEXT_PUBLIC_ONESIGNAL_APP_ID` is set, and loads **nothing** (no SDK, no service worker, no network) when unset; `src/lib/push.ts` gate + `public/OneSignalSDKWorker.js` (v16, matches the SDK); subscription-only (REST key reserved/unused — sending from the OneSignal dashboard). No schema changes, no new dependency (SDK is CDN-loaded). Verified inert (unit 2/2, e2e 1/1 — no `onesignal.com` request + no SW registered; build clean, homepage ○); opus review merge-ready; merged locally. **Activation:** set the public app id (+ safari web id) and **rebuild** (build-time inlined). **→ All 5 Phase 6 sub-projects are now built; the three credential-gated ones (search, newsletter, push) ship inert and flip on when creds land.**
- **Phase 7 — Migration from WordPress.** Batch import highest-value content (by traffic), preserve dates/authors/categories/issues, download media → R2 with rewritten URLs, full 301 redirect map. *(Domains: migration, redirect map)*
- **Phase 8 — Hardening & launch.** Security (rate-limited login/2FA, RBAC, upload sanitization, secure cookies/CSRF, security headers, Cloudflare WAF), compliance (Privacy/Terms/Cookies + cookie consent for Law 09-08 + GDPR), static pages + NewPub footer links, perf + a11y passes, Sentry + uptime + R2 versioning, DNS cutover. *(Domains: security, perf/a11y, compliance, ops)*

## Cross-cutting non-negotiables (every phase)

- Vercel image optimizer is NEVER used (custom Cloudflare loader only).
- No media in DB or repo (R2 only).
- RTL Arabic end to end (logical properties, subsetted font, Arabic dates).
- SEO equity preserved (stable `slug-<id>` + 301 map).
- Traffic decoupled from compute (ISR + on-demand revalidation).
- Ads never wreck CWV (lazy, height-reserved, off critical path).

## Verification strategy

Per phase: deploy to Vercel preview (Neon preview branch); drive pages with Playwright (RTL, layout, no CLS); pull Vercel build logs to self-debug. Image rule verified by confirming zero `/_next/image` requests. SEO via Rich Results / sitemap / redirect checks. CWV measured before launch. Security headers + auth + upload sanitization tested. A11y: keyboard, focus, contrast, reduced-motion, ARIA.

## Deferred / future milestones

- Layalina-style extras: horoscopes, calculators, dream interpretation.
- Comments system.
