# Phase 4 — SEO & Distribution — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-01
**Status:** Approved — ready for implementation plan.

## Goal

Make the public magazine fully discoverable and syndicatable: complete per-page metadata,
structured data (JSON-LD), sitemaps (incl. Google News), RSS, an `llms.txt` for AI
visibility, related articles surfaced, and admin-editable 301-redirect groundwork. RTL/Arabic
throughout, zero-CLS, migration-driven schema changes (`push:false`), Cloudflare image loader
respected (Vercel optimizer never used).

## Confirmed decisions

| Topic | Decision |
|---|---|
| Canonical base URL | `https://lallafatema.ma` (fallback); prefer `NEXT_PUBLIC_SERVER_URL`. |
| Category / author metadata | Add `seoField` to **Categories** (migration); **derive** author metadata from existing user fields. |
| Feeds | Main sitemap + **Google News sitemap** + main RSS + robots.txt. No per-category RSS (YAGNI). |
| 301 redirects | **Payload `Redirects` collection + Next middleware** (exact-path match; wildcard/regex deferred to Phase 7). |
| AI visibility | Add **`/llms.txt`** and welcome AI crawlers in robots.txt. |

## Current-state facts (verified against code)

- `post.seo` group exists (metaTitle, metaDescription, ogImage, canonicalURL, noIndex); Videos share the same `seoField`. **Categories have no SEO fields; Users don't either.**
- `isRecipe` + `recipe` group already modeled on Posts (prepTime, cookTime, servings, cuisine, ingredients[], instructions[]) → ready for Recipe JSON-LD.
- Videos carry videoUrl, thumbnail, description, duration → ready for VideoObject. **No per-video watch pages exist** (facades render on the homepage video band).
- `getRelatedPosts` exists and `ArticleView` already renders "مقالات ذات صلة" — no change needed, just confirm.
- `getSiteConfig()` returns name, tagline, logo, defaultOgImage, social[] (→ `sameAs`) — the source for Organization/WebSite JSON-LD; no new query needed.
- Absolute-URL source today is `NEXT_PUBLIC_SERVER_URL`. Custom Cloudflare loader in `lib/image-loader.ts` keyed on `NEXT_PUBLIC_IMAGE_HOST` (unset locally → returns source URL unchanged).
- Existing `generateMetadata` on article/category/author sets only `title` (+ description on some). Homepage metadata is a static default in the root layout.
- URL scheme (`lib/routes.ts`): category `/<slug>`, article `/<catSlug>/<slug>-<id>`, author `/author/<id>`.

## Architecture

### 1. Central SEO utilities — `src/lib/seo.ts` + `src/components/JsonLd.tsx`

Single module all pages import (one testable place for URL/OG/JSON-LD logic):

- `SITE_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://lallafatema.ma').replace(/\/$/, '')`
- `absoluteUrl(path: string): string`
- `ogImageUrl(media, fallback?): string | undefined` — absolute 1200×630 URL. Routes through the
  Cloudflare loader when `NEXT_PUBLIC_IMAGE_HOST` is set, else the raw absolute `media.url`. Falls
  back to Site Settings `defaultOgImage`.
- `buildMetadata({ title, description, path, image, type, publishedTime, authors, section, noIndex }): Metadata`
  — returns a Next `Metadata`: `title`, `alternates.canonical`, `openGraph`, `twitter` (`summary_large_image`),
  `robots` when `noIndex`. Honors a `seo.canonicalURL` override when passed as `path`/canonical.
- JSON-LD builders (return plain objects, no rendering): `organizationJsonLd(cfg)`, `webSiteJsonLd(cfg)`,
  `newsArticleJsonLd(post, cfg)`, `recipeJsonLd(post, cfg)`, `videoObjectJsonLd(video, cfg)`,
  `breadcrumbJsonLd(items)`.
- `<JsonLd data={…} />` (server component) renders `<script type="application/ld+json">` with
  `JSON.stringify(data)`.
- Root layout sets `metadataBase = new URL(SITE_URL)` so relative canonical/OG paths auto-resolve to absolute.

### 2. Per-page metadata (extend every `generateMetadata`)

- **Article** (`[category]/[slug]/page.tsx`): canonical; OG `type: article` (publishedTime, author, section=category);
  Twitter; `noIndex` from `seo.noIndex`; OG image = `seo.ogImage` → `featuredImage` → `defaultOgImage`.
- **Category** (`[category]/page.tsx`): from new `category.seo` or `name`/`description`; canonical + OG.
- **Author** (`author/[id]/page.tsx`): derived from `name`/`title`/`bio`/`avatar`; canonical + OG `type: profile`.
- **Homepage** (`page.tsx`): add `generateMetadata` (title/description/canonical/OG with `defaultOgImage`).
- **Root layout**: `metadataBase`, default OG image, RSS `alternates` link.

### 3. JSON-LD injection (rendered in page components, keeping `ArticleView` presentational)

- **Site-wide** (root layout): `Organization` + `WebSite`. **SearchAction deferred to Phase 6** (`/search` doesn't exist yet — do not point at a 404).
- **Article page**: `NewsArticle` + `BreadcrumbList` (Home › Category › Article); additionally `Recipe` when `isRecipe`.
- **Category page**: `BreadcrumbList` (Home › Category).
- **Homepage**: `VideoObject` items for the video band (interim home for VideoObject until per-video pages in Phase 6).

### 4. Sitemaps + robots (route handlers — Next's `sitemap.ts` can't emit the News namespace)

- `/sitemap.xml` — all published posts + categories + author pages + static + homepage. Single file for now;
  split/paginate at the Phase 7 WordPress import when volume justifies it (YAGNI).
- `/news-sitemap.xml` — posts from the **last 48h** with `<news:news>` (publication name = site name, language `ar`, title, publication date).
- `robots.txt` via `src/app/robots.ts` — allow all; disallow `/admin`, `/api`, `/preview`; reference both sitemaps and `/llms.txt`; explicitly welcome AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended).

### 5. RSS — `/rss.xml` route handler

RSS 2.0, latest ~20 published posts: title, absolute link/guid, `excerpt` as description, `pubDate`, category,
`media:content` image, `<language>ar</language>`. Linked from `<head>` via layout `alternates`.

### 6. `llms.txt` — `/llms.txt` route handler (AI/LLM visibility)

Markdown per the `llms.txt` convention, built dynamically:
- Site name + tagline + one-line description of what لالة فاطمة is.
- `# الأقسام` — every category linked (absolute URLs).
- `# أحدث المقالات` — latest ~20 posts (title → absolute URL).
- Served `text/plain; charset=utf-8`, revalidated like the sitemaps. No `llms-full.txt` (YAGNI).

### 7. Related articles

`getRelatedPosts` + `ArticleView`'s "مقالات ذات صلة" already work. Confirm during verification; no code/schema change.

### 8. Category SEO schema change

Add the existing `seoField` to `Categories.ts`. `push:false` migration applied to Neon; regenerate `payload-types.ts`.

### 9. 301 redirect groundwork

- **`Redirects` collection** (`src/collections/Redirects.ts`): `from` (path, indexed/unique), `to`, `type`
  (select 301/302, default 301), `active` (checkbox, default true). Read = anyone; create/update/delete = admin/editor.
  Registered in `payload.config.ts`. `push:false` migration.
- **`src/middleware.ts`**: on each request, match `pathname` against a **cached redirect map** fetched from an
  internal `/redirects-map.json` route (`next: { revalidate, tags: ['redirects'] }`; the collection's `afterChange`
  busts the `redirects` tag). Routed **outside `/api`** to avoid Payload's `(payload)/api/[...slug]` catch-all.
  **Exact-path match only**; wildcard/regex deferred to Phase 7. Skips `/admin`, `/api`,
  `/_next`, and static assets via the middleware `matcher`.

## Schema changes / migrations (both `push:false`)

1. Categories `seo` group.
2. `Redirects` collection.

Create with `npx pnpm@10.18.0 exec payload migrate:create <name>`, apply with `... migrate` (or via Neon MCP), then regenerate `payload-types.ts`.

## New / modified files

**New:**
- `src/lib/seo.ts`
- `src/components/JsonLd.tsx`
- `src/collections/Redirects.ts`
- `src/middleware.ts`
- `src/app/(frontend)/sitemap.xml/route.ts`
- `src/app/(frontend)/news-sitemap.xml/route.ts`
- `src/app/(frontend)/rss.xml/route.ts`
- `src/app/(frontend)/llms.txt/route.ts`
- `src/app/robots.ts`
- `src/app/(frontend)/redirects-map.json/route.ts` (internal cached map for middleware; outside `/api`)
- 2 migration files.

**Modified:**
- `src/collections/Categories.ts` (+ `seoField`)
- `src/payload.config.ts` (register `Redirects`)
- `src/app/(frontend)/layout.tsx` (metadataBase, default OG, RSS alternate, site-wide Organization + WebSite JSON-LD)
- `src/app/(frontend)/page.tsx` (generateMetadata + homepage VideoObject JSON-LD)
- `src/app/(frontend)/[category]/[slug]/page.tsx` (full metadata + NewsArticle/Recipe/Breadcrumb JSON-LD)
- `src/app/(frontend)/[category]/page.tsx` (metadata + Breadcrumb JSON-LD)
- `src/app/(frontend)/author/[id]/page.tsx` (metadata)
- `src/payload-types.ts` (regenerated)

## Non-negotiables honored

- Vercel image optimizer never used (Cloudflare loader only; OG images via loader or raw absolute URL).
- RTL/Arabic throughout (Arabic titles/descriptions, `ar` language in feeds/sitemaps/llms.txt).
- Zero-CLS (no new above-the-fold layout; JSON-LD/meta are head-only).
- SEO equity preserved (stable `slug-<id>` retained; redirect engine groundwork).
- Migration-driven schema (`push:false`).

## Verification

`npx pnpm@10.18.0 exec tsc --noEmit` + `eslint .` + `npx pnpm@10.18.0 build`, then Playwright against `npx pnpm@10.18.0 dev`:
- Assert `<title>`, canonical, OG, Twitter tags on article/category/author/homepage.
- Parse every JSON-LD `<script>` block as valid JSON; spot-check `@type` values.
- Fetch `/sitemap.xml`, `/news-sitemap.xml`, `/rss.xml`, `/robots.txt`, `/llms.txt` — valid XML/text, absolute URLs.
- Seed a `Redirects` row and confirm the path 301s via middleware.

## Out of scope (later phases)

- WebSite `SearchAction` + per-video watch pages → Phase 6.
- Full WordPress 301 redirect map + sitemap pagination → Phase 7.
- Per-category RSS, `llms-full.txt` → not planned (YAGNI).
