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
- **Phase 1 — Data model + media pipeline.** Payload collections (Posts, Categories[hierarchical], Tags, Users/Authors, Media, MagazineIssues, Videos, Pages) + globals (Homepage layout, Menus, Ads); roles/access control; R2 storage adapter; custom image loader (verify Vercel optimizer bypassed). *(Domains: content model, media pipeline)*
- **Phase 2 — Core public site.** Homepage (static structure), category pages, article page, author pages — RTL, ISR, LCP/CLS/INP discipline, a11y, design language from references. *(Domains: rendering/perf, RTL, a11y, partial SEO)*
- **Phase 3 — Editorial / curation layer.** Homepage builder (pin posts into slider/panels), menu/mega-menu management, live preview, drafts/versions, scheduling, autosave, on-publish revalidation. *(Domains: globals, CMS UX)*
- **Phase 4 — SEO & distribution.** Metadata + canonical, OG/Twitter, per-article SEO overrides, JSON-LD (Article/NewsArticle, BreadcrumbList, Organization, WebSite+SearchAction, Recipe, VideoObject), sitemaps (incl. Google News) + RSS, stable `slug-<id>`, related articles. *(Domain: SEO)*
- **Phase 5 — Ads & consent.** Ad zones (header, in-article, between-cards, sidebar, sticky), lazy-loaded + height-reserved; dashboard ads management (programmatic + house ads); CMP. *(Domains: ads, consent)*
- **Phase 6 — Genre features.** Meilisearch search, magazine archive (PDF viewer + download), video facades + VideoObject, Brevo newsletter, OneSignal push. *(Domain: search + genre features)*
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
