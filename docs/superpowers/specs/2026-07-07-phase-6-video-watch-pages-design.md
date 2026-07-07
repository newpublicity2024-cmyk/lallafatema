# Phase 6 (sub-project 2) — Per-Video Watch Pages — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-07
**Status:** Approved — ready for implementation plan.

## Goal

Give every video its own indexable **watch page** (`/videos/<slug>-<id>`) with the player, metadata,
`VideoObject` structured data, and a related-videos rail. Video cards across the site (starting with
the homepage band) become **links** to these pages instead of playing inline. This completes the
Phase-4-deferred "per-video watch pages + VideoObject" item. RTL/Arabic, ISR, CWV-safe (the embed
loads only on click). **No schema changes** — the `videos` collection already has everything.

This is sub-project 2 of Phase 6 (the others: magazine archive [done], Meilisearch search, Brevo
newsletter, OneSignal push). This spec covers **only** per-video watch pages.

## Confirmed decisions

| Topic | Decision |
|---|---|
| URL scheme | **`/videos/[slugId]`** where `slugId = <slug>-<id>` (plural `videos` — the singular `video` is a category slug, and `/video/x-<id>` would collide with the `/[category]/[slug]` article route). Looked up by the parsed numeric `id`; the correct slug is canonical. |
| Entry points | **Video cards link to the watch page** (`VideoCard` navigates to `videoWatchUrl(video)`); no inline play. No separate `/videos` index in v1 (homepage band + related rails + future search are the entry points). |
| Player | **Facade** on the watch page — large thumbnail + play → `<iframe>` embed on click (CWV-safe, mirrors the current card behavior; the embed logic moves into a `VideoPlayer` component). |
| Related videos | Same-category (fallback latest) rail of `VideoCard`s for internal linking + engagement. |
| VideoObject placement | **Move `VideoObject` JSON-LD off the homepage band onto the watch pages** — each video's structured data lives on its own canonical page (avoids duplicate markup). |
| Schema changes | **None.** `videos` already has `slug` + `seo` + everything needed. |

## Current-state facts (verified against code)

- **`videos` collection** (`src/collections/Videos.ts`): `title` (req), `videoUrl` (req), `thumbnail`
  (upload→media, optional), `description`, `duration`, `category` (rel), `publishedAt`, **`slug`
  (`slugField('title')`)**, **`seoField`**. `versions.drafts: true`; `access.read: canReadPublished`;
  `revalidate*` hooks wired. Payload type `Video` in `@/payload-types` (id, slug optional, etc.).
- **`VideoCard`** (`src/components/VideoCard.tsx`) is a `'use client'` component that plays inline:
  `useState(playing)` + `embedUrl()` (YouTube/Vimeo watch→embed) → `<iframe …?autoplay=1>` on click.
  Variants `'lead'` | `'list'`. Used by `VideoSection`. **`embedUrl` currently lives inside this file.**
- **`VideoSection`** (`src/components/VideoSection.tsx`) renders the dark band (`lf-band-dark`), a lead
  `VideoCard` + up to 4 list cards, heading linked to `categoryUrl('video')`.
- **Homepage** (`src/app/(frontend)/page.tsx`) emits `<JsonLd data={videoObjectJsonLd(v)} />` per video
  that has a thumbnail (the block above `<HeroFeature>`), then renders `<VideoSection videos={videos} />`.
- **`videoObjectJsonLd(video)`** already exists in `src/lib/seo.ts` (name, description, thumbnailUrl,
  uploadDate, contentUrl, embedUrl, inLanguage). `breadcrumbJsonLd`, `buildMetadata`, `ogImageUrl` too.
- **`getLatestVideos(limit=5)`** exists (`src/lib/queries.ts`, published-only, `depth:1`); a `PUBLISHED`
  where-constant is used across queries.
- **`idFromSlugParam(param)`** (`src/lib/routes.ts`) extracts the trailing `-<id>` (or a bare numeric id)
  → the exact parser articles use. No video URL helper yet.
- **Routing collision:** a category has slug `video`, so `/video` is a category page and `/[category]/[slug]`
  would capture `/video/<slug>-<id>`. **`/videos/…` (plural) is free** and avoids this.
- Pages follow: server components, `export const revalidate = 3600`, `generateMetadata` via
  `buildMetadata`, `.lf-container`, `PostImage` covers (Cloudflare loader), `notFound()` on miss.

## Architecture

### 1. Embed util — `src/lib/video.ts`

Move `embedUrl(url: string): string | null` (YouTube/Vimeo watch→embed, unknown host → null) out of
`VideoCard` into a shared module so both the player and any future consumer import one implementation.

### 2. URL helper — `src/lib/routes.ts`

- `videoWatchUrl(video: Pick<Video, 'id' | 'slug'>): string` → `/videos/${slug || 'video'}-${id}`
  (same shape as `postUrl`). Reuse `idFromSlugParam` to parse the route segment back to an id.

### 3. Queries — `src/lib/queries.ts`

- `getVideoById(id: number): Promise<Video | null>` — published-only (`PUBLISHED`), `depth:1`
  (populates thumbnail + category), `docs[0] ?? null`.
- `getRelatedVideos(video: Video, limit = 5): Promise<Video[]>` — same `category` id (when set),
  excluding `video.id`, published-only, newest first; if fewer than `limit` (or no category), top up
  from `getLatestVideos` (also excluding the current id). Returns up to `limit` (fills the reused
  `VideoSection` lead + 4 layout).

### 4. Video player — `src/components/VideoPlayer.tsx`

`'use client'`. The watch-page facade (the interactive bit lifted out of `VideoCard`): large
`aspect-video` thumbnail (`PostImage`) + magenta play button; on click, swaps in
`<iframe src={embedUrl(videoUrl)}?autoplay=1 …>` (height-reserved → no CLS). If `embedUrl` returns
null (unknown host), the play button becomes an external `<a href={videoUrl} target="_blank">`. Props:
`{ videoUrl: string; thumbnail; title: string }`.

### 5. VideoCard refactor — `src/components/VideoCard.tsx`

Cards now **navigate**, so the inline-play state/iframe is removed. The thumbnail + play overlay +
title become a `<Link href={videoWatchUrl(video)}>`. Both `'lead'` and `'list'` variants keep their
existing layout/markup (they stay dark-styled — `VideoCard` is only ever rendered inside the dark
`VideoSection` band, on the homepage and the related rail). Only the frame's behavior changes (Link,
not `useState`/iframe). With no interactivity left it drops `'use client'` and becomes a server
component. `embedUrl` is no longer imported here (it moved to `lib/video.ts`, used by `VideoPlayer`).

### 6. Watch page — `src/app/(frontend)/videos/[slugId]/page.tsx`

Server component, `revalidate = 3600`. `idFromSlugParam(params.slugId)` → `null` or missing/unpublished
video → `notFound()`. Renders: breadcrumb (الرئيسية / فيديو / title), `<VideoPlayer>`, `h1` title,
category kicker (link to `categoryUrl`), Arabic `publishedAt`, `description`, then the related rail as
**`<VideoSection videos={related} title="مقاطع ذات صلة" />`** (reuses the existing dark band — no new
light-variant card needed; renders nothing when `related` is empty). Emits
`<JsonLd data={videoObjectJsonLd(video)} />` + breadcrumb JSON-LD.
`generateMetadata` → title, description, canonical `videoWatchUrl`, OG image = thumbnail (via
`ogImageUrl`), honoring the video's `seo` overrides where present (mirror how the article page uses
`seo`).

### 7. SEO wiring

- `sitemap.xml/route.ts`: add published `videos` and append each `videoWatchUrl` (lastmod = updatedAt).
- **Homepage** (`page.tsx`): remove the per-video `videoObjectJsonLd` map block (the VideoObject now
  lives on the watch pages). `VideoSection` still renders the band (cards now link out).

## Files

| File | Change |
|---|---|
| `src/lib/video.ts` | **New** — `embedUrl` (moved from VideoCard) |
| `src/lib/routes.ts` | + `videoWatchUrl` |
| `src/lib/queries.ts` | + `getVideoById`, `getRelatedVideos` |
| `src/components/VideoPlayer.tsx` | **New** — facade→iframe player |
| `src/components/VideoCard.tsx` | Refactor → link to watch page (drop inline play + `'use client'`) |
| `src/app/(frontend)/videos/[slugId]/page.tsx` | **New** — watch page + metadata + JSON-LD |
| `src/app/(frontend)/sitemap.xml/route.ts` | + video watch URLs |
| `src/app/(frontend)/page.tsx` | Remove homepage per-video VideoObject block |
| `tests/int/routes.int.spec.ts` | + `videoWatchUrl` build/parse tests |
| `tests/e2e/videos.e2e.spec.ts` | **New** — band card → watch page → play + related |

## Verification

- `tsc --noEmit` + `eslint .` + `pnpm build` clean; `/videos/[slugId]` is dynamic (`ƒ`), homepage still
  static.
- Vitest: `videoWatchUrl({id:7,slug:'x'})` → `/videos/x-7`; `idFromSlugParam('x-7')` → 7 (existing
  parser, add a video-shaped case).
- Playwright (dev server, RTL; requires ≥1 published video — the redesign seed already added sample
  videos; the controller confirms/seeds one): homepage video-band card links to `/videos/<slug>-<id>`;
  the watch page shows the player (thumbnail + play), clicking play mounts the `<iframe>`; the related
  rail renders; the breadcrumb + `VideoObject` JSON-LD are present.
- Confirm 0 `/_next/image` on thumbnails; VideoObject JSON-LD parses; no CLS when the iframe mounts.

## Out of scope (this sub-project)

- A `/videos` archive index (homepage band + related rails + future search are the entry points).
- Playlists, view counts, comments, autoplay-next, watch history.
- 301-redirecting a mismatched slug to canonical (canonical metadata covers it; render-by-id is
  tolerant). Bulk video redirects → Phase 7.
- Meilisearch search / Brevo / OneSignal — separate Phase 6 sub-projects.

## Deferred ideas (noted, not lost)

- `/videos` archive grid if video volume grows (cheap to add later; mirrors the magazine archive).
- Category-scoped video pages (the `video` category page already lists them via `/[category]`).

---
*Phase: 06-video-watch-pages*
*Design gathered: 2026-07-07*
