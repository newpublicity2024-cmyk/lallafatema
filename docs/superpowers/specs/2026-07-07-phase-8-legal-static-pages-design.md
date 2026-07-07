# Phase 8.1 — Legal & Static Pages (Design)

**Date:** 2026-07-07
**Status:** Approved (design), pending spec review
**Sub-project:** Phase 8 (hardening & launch), item #1 of 5

## Problem

The site links to five static/legal pages from the footer, the consent banner, and
SiteSettings — but no frontend route renders the `pages` collection, so every one of
those URLs 404s. Most visibly, the cookie-consent banner's "privacy policy" link points
to `/privacy`, which currently returns 404. Launch is blocked until these pages exist.

## Goal

Render the existing Payload `pages` collection at clean top-level URLs, seed real Arabic
draft content for the five pages the footer already links, and fix the `/privacy` 404 —
with no database schema change.

## Scope

**In scope — exactly five pages** (the ones the footer links today, from
`src/lib/site.ts` `FOOTER_PAGES`):

| slug              | title (Arabic)      | purpose            |
|-------------------|---------------------|--------------------|
| `about`           | من نحن              | about the magazine |
| `editorial-board` | هيئة التحرير        | editorial team     |
| `advertise`       | للإعلان على موقعنا  | advertising info   |
| `privacy`         | سياسة الخصوصية      | privacy policy     |
| `terms`           | شروط الاستخدام      | terms of use       |

**Out of scope (YAGNI):** `/cookies`, `/contact`, any contact form, new CMS fields,
header/nav changes, and any deployment (deploy is deferred — work stays local).

## Content source

The Arabic copy (including the legal text for `privacy` and `terms`) is **AI-drafted as a
starting point** at the user's request. It MUST be human-reviewed before go-live. Because
content lives in the CMS `pages` collection, corrections need no code change. Tracked in
memory: `review-legal-copy-before-launch`.

## Architecture

### Routing — fallthrough in the existing `[category]` route (Approach A)

Next.js App Router forbids two dynamic segments as siblings, so a separate `[page]` route
next to `[category]` is impossible. Instead, `src/app/(frontend)/[category]/page.tsx`
becomes a small dispatcher:

1. Resolve the slug as a **category** → render the category listing (existing behaviour, unchanged).
2. Else resolve it as a published **page** → render `<PageView>`.
3. Else `notFound()`.

The same fallthrough is applied in `generateMetadata` (page SEO/meta) and
`generateStaticParams` (page slugs added to the pre-rendered set alongside categories).

Static route segments (`/search`, `/magazine`, `/videos`, `/newsletter`, …) continue to
take precedence over the dynamic segment automatically — pages cannot shadow them. The
five page slugs also don't collide with any existing category slug.

Rejected alternatives:
- **B — prefixed `/p/[slug]`:** isolated but contradicts every existing link (footer,
  SiteSettings `privacyPolicyUrl`, consent banner) and produces uglier URLs. More churn,
  worse for launch/legal context.
- **C — five hardcoded route files:** bypasses the CMS collection, duplicates layout, and
  needs a code change per new page.

### Components & modules

- **`getPageBySlug(slug)`** — new query in `src/lib/queries.ts`. Finds one **published**
  page by slug (mirrors `getCategoryBySlug`); returns `null` when none. Drafts return
  `null` (respect `_status`).
- **`PageView`** — new component `src/components/PageView.tsx`. ArticleView-style but
  simpler: breadcrumb (الرئيسية / page title), `<h1>`, `<RichText className="prose-ar">`
  for RTL, and an "آخر تحديث: <date>" line derived from `updatedAt` shown on **privacy and
  terms only**. No share buttons, no related posts, no ads.
- **`[category]/page.tsx`** — modified to dispatch category-vs-page as described above.

### Data model

**No schema change.** The `pages` collection already provides `title`, `content`
(richText / Lexical), `slug`, and `seo` (via `seoField`). `updatedAt` is automatic in
Payload and supplies the "last updated" line. Nothing to migrate.

### Seeding

- Five pages seeded through the existing `src/seed/index.ts`, **idempotent by slug**
  (find-by-slug, create only when absent — re-running never duplicates).
- The seed's `lexical()` helper is extended to support **h2 headings** and **bullet
  lists** in addition to paragraphs, so legal pages read as structured documents rather
  than an undifferentiated block of paragraphs.
- Seed executed against Neon locally using the repo's established pattern
  (`npx pnpm@10.18.0`, `dotenv/config`).

### SEO & wiring

- The consent-banner `/privacy` 404 is fixed as a **direct consequence** of the route now
  resolving pages — no banner change.
- The footer already links all five slugs correctly (`FOOTER_PAGES`) — verify only, no
  change expected.
- **Sitemap:** `src/app/(frontend)/sitemap.xml/route.ts` gains the published pages
  (`/about`, `/editorial-board`, `/advertise`, `/privacy`, `/terms`) with `lastmod` from
  `updatedAt`, so they're discoverable.
- Per-page `<title>`/meta via the existing `seoField` + `buildMetadata`, exactly as
  categories do it.

## Testing

- **Integration** (`tests/int/pages.int.spec.ts`):
  - `getPageBySlug` returns a published page for a known slug.
  - Returns `null` for an unknown slug.
  - Returns `null` for a draft (unpublished) page.
- **E2E** (`tests/e2e/pages.e2e.spec.ts`):
  - `/privacy` returns 200 and renders page content (the exact regression that was 404ing).
  - An unknown top-level slug still returns 404.
  - An existing category route still renders (no regression from the dispatcher change).

## Success criteria

1. Visiting `/about`, `/editorial-board`, `/advertise`, `/privacy`, `/terms` each renders
   its page with Arabic content and correct `<title>`/meta.
2. The consent banner's privacy link resolves (no 404).
3. Unknown top-level slugs and all existing category routes behave unchanged.
4. The five pages appear in `sitemap.xml`.
5. No schema/migration change; `pnpm typecheck`, integration, and E2E tests pass.
6. A standing reminder exists to have the privacy/terms (and about/advertise) copy
   human-reviewed before launch.
