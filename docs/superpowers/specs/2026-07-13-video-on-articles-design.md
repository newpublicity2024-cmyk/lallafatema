# Video-on-Articles + Videos Section (Design / strategy)

**Date:** 2026-07-13
**Status:** DRAFT strategy — captured for a future session to turn into a plan → build.
**Owner decision:** user will execute in a new session.

## Problem / goal

Migrated content includes **video articles** (36 in the `فيديو` category + 7 regular
articles that embed a video) where the video is stored as a **link** (35 YouTube, 1
Instagram; each article has exactly one video + real body text — median ~1.6k chars).
See [[wp-migration-status]]. Today a Post's hero is image-only, and there's a separate
standalone `Videos` collection. We want video to be **a property of an article**: an
article's hero can be an image OR a video, and a dedicated Videos section lists every
article that has a video, newest first.

## Desired behavior (from the user)

1. **Article hero can hold a video.** In the hero slot of the article page, an editor
   can insert a video URL and the video plays there.
2. **Video hero shows a thumbnail** that reads like a normal hero image, but it's a
   video (play button → plays on click).
3. **Admin: image OR video.** The featured/hero field in the Posts admin lets the
   editor choose between uploading an **image** or providing a **video URL**.
4. **Videos section** displays **all videos found across articles**, ordered by
   **latest published first**.

## Existing pieces to REUSE (do not rebuild)

- `src/components/VideoPlayer.tsx` — the exact facade wanted: thumbnail + play overlay,
  loads the `<iframe>` only on click (CWV-safe), external-link fallback for
  non-embeddable hosts. Props: `{ videoUrl, thumbnail, title }`.
- `src/lib/video.ts` `embedUrl(url)` — YouTube/Vimeo watch URL → embed src (returns
  `null` for unknown hosts, e.g. Instagram → currently would fall back to a link).
- `src/components/PostImage.tsx` (thumbnail/placeholder), `PostCard.tsx`,
  `VideoCard.tsx`, `VideoSection.tsx`, `HeroFeature.tsx`.
- `src/collections/Posts.ts` — has `featuredImage` (upload→media) at ~L75.

## Proposed data model (Posts)

Keep `featuredImage` as the **universal thumbnail/poster** (used on cards AND as the
video poster). Add a small featured-media choice:

- `featuredType` — `select` `{ image | video }`, default `image`, sidebar.
- `featuredVideoUrl` — `text`, shown via `admin.condition` only when
  `featuredType === 'video'`; validated as a URL. This is the playable video.
- `featuredImage` stays as-is and is used as the **poster/thumbnail in both modes**.
  For a video with no uploaded poster, auto-derive a YouTube thumbnail at render time
  (`https://img.youtube.com/vi/<id>/hqdefault.jpg`) as a fallback.

Rationale: one universal thumbnail keeps cards/OG images working for video posts, and
the mode toggle makes the editor intent explicit + lets us require the URL. No new
collection, no relationship churn.

**Migration alignment:** the scraped video articles already carry `hero_image`
(→ `featuredImage`) and `videos[0]` (→ `featuredVideoUrl` = its `url`/`embed_url`). So
importing them = the same text migration we already ran (drop the `فيديو`
`SKIP_CATEGORIES` exclusion) + set `featuredType:'video'` + `featuredVideoUrl`. Same for
the 7 in-other-category articles that have a `videos[]` entry.

## Rendering

- **Article hero (`HeroFeature`/`ArticleView`):** if `featuredType==='video'` &&
  `featuredVideoUrl` → render `<VideoPlayer videoUrl thumbnail={featuredImage} title/>`
  in the hero position (thumbnail shows immediately, play → iframe). Else → the current
  static `featuredImage` hero. Preserves zero-CLS + no-iframe-until-click.
- **Cards (`PostCard`):** a video post shows its `featuredImage` thumbnail with a small
  play badge (so lists visibly mark videos). Clicking the card → the article page (where
  the video plays), not inline.

## Videos section

A `/videos` listing page (and point the existing **"فيديو"** nav item at it):

- Query: **Posts where `featuredType==='video'` (or `featuredVideoUrl` set), published,
  ordered by `publishedAt` DESC.** Paginated like category pages.
- Render: grid of video cards (thumbnail + play badge + title + date) linking to each
  article. Reuse `PostCard` (video variant) or `VideoCard` styling.
- SEO: `VideoObject` JSON-LD per card is optional here; the per-article page can carry
  `VideoObject` (moved/kept from the existing watch-page work).

## Reconcile with the existing standalone `Videos` collection — DECISION NEEDED

Today there's a `Videos` collection + `/videos/[slugId]` watch pages + homepage
`VideoSection`. The new model makes video an article property, which largely supersedes
it. Options for the planning session to choose:
- **(A, recommended)** Retire the standalone `Videos` collection for editorial video;
  `/videos` becomes the article-video listing; keep `VideoPlayer`/`embedUrl`. Decide
  what happens to the homepage video band (repoint to latest video-posts) and the
  `/videos/[slugId]` watch pages (redirect to the article, or drop).
- **(B)** Keep both: standalone Videos for pure clips, article-videos for editorial.
  More surface area, two sources for "the videos section" to merge.

## Open decisions for the planning session

1. **Categories for the 36 `فيديو` posts.** Video is now orthogonal to category — every
   video post still needs a real category. Create a dedicated `video` category, or map
   each from its scraped secondary `categories[]`? (Recommend: a `video` category so
   they have a home; `/videos` aggregates across all categories regardless.)
2. **Instagram (1) + the 3 with no link.** `embedUrl` doesn't handle Instagram → either
   add an Instagram embed branch, render it as an external-link facade, or skip. The 3
   with no captured link import as normal (image) posts.
3. **Videos collection fate** — option A vs B above.
4. **Homepage video band** — repoint to latest video-posts, or leave as-is.

## Files likely touched (for the plan)

- `src/collections/Posts.ts` — `featuredType` + `featuredVideoUrl` (conditional) fields;
  migration `add_post_featured_video` (Neon MCP apply per [[neon-migration-apply]]).
- `src/components/HeroFeature.tsx` / article view — video-hero branch (reuse VideoPlayer).
- `src/components/PostCard.tsx` — play badge for video posts.
- `src/app/(frontend)/videos/…` — new `/videos` listing page; repoint nav.
- `src/lib/queries.ts` — `getVideoPosts()` (published, has-video, publishedAt DESC).
- `src/lib/video.ts` — optional Instagram embed support.
- `src/seed/migrate-wp.ts` — remove `فيديو` from `SKIP_CATEGORIES`; wire `videos[0]` →
  `featuredVideoUrl` (+ featuredType) on import; also set it on the 7 in-article videos.
- Possibly remove/repurpose `src/collections/Videos.ts`, `/videos/[slugId]`,
  `VideoSection` depending on the reconcile decision.

## Verification (for the plan)

tsc + eslint + `pnpm build` clean; homepage stays `○ Static`; article video hero loads
NO iframe until click (0 third-party requests on load); `/videos` lists video-posts
newest-first; migrated video posts render (poster + play → embed); 0 `/_next/image`.
