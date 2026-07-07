# Phase 6 — Per-Video Watch Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every video an indexable `/videos/<slug>-<id>` watch page (facade player + VideoObject + related rail); video cards link to it instead of playing inline.

**Architecture:** Extract the YouTube/Vimeo embed util into `lib/video.ts`; add a `videoWatchUrl` helper and two published-only queries. Build a `VideoPlayer` (the facade lifted out of `VideoCard`) and the watch page (reusing `VideoSection` for the related rail). Then refactor `VideoCard` to a navigational server component and move `VideoObject` JSON-LD off the homepage onto the watch pages. No schema changes.

**Tech Stack:** Next.js 16 (App Router, async `params`), Payload CMS 3.85 Local API, Tailwind v4, Vitest (`tests/int/**/*.int.spec.ts`), Playwright (`tests/e2e/**/*.e2e.spec.ts`).

## Global Constraints

- **pnpm:** always `npx pnpm@10.18.0 …` (PATH pnpm is too old).
- **No schema changes** — `videos` already has `title`, `videoUrl`, `thumbnail`, `description`, `duration`, `category`, `publishedAt`, `slug`, `seo`.
- **URL scheme:** `/videos/<slug>-<id>` (plural `videos`; the singular `video` is a category slug and `/video/x-<id>` collides with the `/[category]/[slug]` article route). Parse the segment with the existing `idFromSlugParam` (extracts trailing `-<id>`).
- **Images only through `PostImage`** (Cloudflare `next/image` loader); the Vercel optimizer is never used.
- **ISR:** every page `export const revalidate = 3600`; **no `cookies()`/`headers()`** in any video page.
- **Published-only queries:** filter with the existing `PUBLISHED` where-constant (`src/lib/queries.ts:14`) — the Local API bypasses access control.
- **RTL Arabic:** `.lf-container`, brand tokens (`brand-600`), Arabic copy, `formatDate` from `@/lib/format`, internal links via `next/link` (`<a href="/internal">` trips `@next/next/no-html-link-for-pages`).
- **`VideoObject` moves to the watch pages** — removed from the homepage band.
- **Related rail reuses `<VideoSection>`** (a full-bleed dark band) — render it as a direct `<main>` child, OUTSIDE `.lf-container`, so its own container/full-bleed styling works.
- **Test data:** 5 published videos already seeded (all with slugs) — no new seed needed.
- **Verify loop:** `npx pnpm@10.18.0 exec tsc --noEmit` + `npx pnpm@10.18.0 lint` after each task; full `npx pnpm@10.18.0 build` at Task 4.

---

### Task 1: Embed util + watch-URL helper (+ point VideoCard at the moved util)

Extract the embed logic to a shared module and add the URL helper — both pure, TDD. Update `VideoCard` to import the moved util (no behavior change yet).

**Files:**
- Create: `src/lib/video.ts`
- Modify: `src/lib/routes.ts`
- Modify: `src/components/VideoCard.tsx` (swap its local `embedUrl` for the imported one)
- Test: `tests/int/video.int.spec.ts` (new); `tests/int/routes.int.spec.ts` (append)

**Interfaces:**
- Consumes: `Video` from `@/payload-types`.
- Produces: `embedUrl(url: string): string | null` (from `@/lib/video`); `videoWatchUrl(video: Pick<Video,'id'|'slug'>): string` (from `@/lib/routes`).

- [ ] **Step 1: Write the failing tests**

Create `tests/int/video.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { embedUrl } from '@/lib/video'

describe('embedUrl', () => {
  it('maps youtu.be short links', () => {
    expect(embedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('maps youtube watch links', () => {
    expect(embedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('passes through youtube embed links', () => {
    expect(embedUrl('https://www.youtube.com/embed/abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('maps vimeo links', () => {
    expect(embedUrl('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345')
  })
  it('returns null for unknown hosts and invalid urls', () => {
    expect(embedUrl('https://example.com/x')).toBeNull()
    expect(embedUrl('not a url')).toBeNull()
  })
})
```

Append to `tests/int/routes.int.spec.ts` (new `describe` block):

```ts
import { videoWatchUrl } from '@/lib/routes'

describe('videoWatchUrl', () => {
  it('builds /videos/<slug>-<id>', () => {
    expect(videoWatchUrl({ id: 7, slug: 'my-video' })).toBe('/videos/my-video-7')
  })
  it('falls back to "video" when slug is missing', () => {
    expect(videoWatchUrl({ id: 7, slug: null })).toBe('/videos/video-7')
  })
})
```

(Keep the existing imports in `routes.int.spec.ts`; add `videoWatchUrl` to the import from `@/lib/routes`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video.int.spec.ts tests/int/routes.int.spec.ts`
Expected: FAIL — `@/lib/video` not found and `videoWatchUrl` not exported.

- [ ] **Step 3: Create `src/lib/video.ts`**

```ts
/** YouTube/Vimeo watch URL → embeddable src. Returns null for unknown hosts. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (host.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return url
      const v = u.searchParams.get('v')
      return v ? `https://www.youtube.com/embed/${v}` : null
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Add `videoWatchUrl` to `src/lib/routes.ts`**

Extend the type import (line 1) to include `Video`:

```ts
import type { Category, MagazineIssue, Post, Video } from '@/payload-types'
```

Append:

```ts
/** Permalink for a video watch page. Plural `/videos/` avoids the `video` category route. */
export function videoWatchUrl(video: Pick<Video, 'id' | 'slug'>): string {
  return `/videos/${video.slug || 'video'}-${video.id}`
}
```

- [ ] **Step 5: Point `VideoCard` at the moved util**

In `src/components/VideoCard.tsx`, delete the local `embedUrl` function (the `function embedUrl(url: string) { … }` block) and import it instead. Add near the top imports:

```ts
import { embedUrl } from '@/lib/video'
```

Leave the rest of `VideoCard` unchanged (it still plays inline for now — behavior is identical).

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video.int.spec.ts tests/int/routes.int.spec.ts && npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: tests PASS; tsc + lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/video.ts src/lib/routes.ts src/components/VideoCard.tsx tests/int/video.int.spec.ts tests/int/routes.int.spec.ts
git commit -m "feat(videos): embedUrl util + videoWatchUrl helper"
```

---

### Task 2: Queries + VideoPlayer + watch page

Build the destination: two queries, the facade player, and the `/videos/[slugId]` page. `VideoCard` still plays inline (homepage unchanged) — nothing links here yet, so no broken interim.

**Files:**
- Modify: `src/lib/queries.ts`
- Create: `src/components/VideoPlayer.tsx`
- Create: `src/app/(frontend)/videos/[slugId]/page.tsx`

**Interfaces:**
- Consumes: `embedUrl` (Task 1, `@/lib/video`); `videoWatchUrl`, `idFromSlugParam`, `categoryUrl` (`@/lib/routes`); `getLatestVideos`, `PUBLISHED`, `getSiteConfig` (existing); `videoObjectJsonLd`, `breadcrumbJsonLd`, `buildMetadata`, `ogImageUrl` (existing); `VideoSection`, `JsonLd`, `PostImage`, `PlayIcon` (existing); `formatDate`.
- Produces: `getVideoById(id): Promise<Video|null>`, `getRelatedVideos(video, limit?): Promise<Video[]>`, `VideoPlayer` component, the `/videos/[slugId]` route.

- [ ] **Step 1: Add the two queries**

In `src/lib/queries.ts`, append (the `Video` type is already imported; `getLatestVideos` and `PUBLISHED` already exist above):

```ts
/** One published video by id, or null. `depth:1` populates thumbnail + category. */
export async function getVideoById(id: number): Promise<Video | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'videos',
    where: { and: [{ id: { equals: id } }, PUBLISHED] },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}

/** Related videos: same category first (excluding self), topped up with latest. */
export async function getRelatedVideos(video: Video, limit = 5): Promise<Video[]> {
  const payload = await getPayloadClient()
  const categoryId =
    video.category && typeof video.category === 'object' ? video.category.id : video.category
  const out: Video[] = []
  const seen = new Set<number>([video.id])

  if (categoryId) {
    const { docs } = await payload.find({
      collection: 'videos',
      where: { and: [{ category: { equals: categoryId } }, { id: { not_equals: video.id } }, PUBLISHED] },
      sort: ['-publishedAt', '-createdAt'],
      depth: 1,
      limit,
    })
    for (const v of docs) {
      out.push(v)
      seen.add(v.id)
    }
  }
  if (out.length < limit) {
    for (const v of await getLatestVideos(limit + 1)) {
      if (out.length >= limit) break
      if (!seen.has(v.id)) {
        out.push(v)
        seen.add(v.id)
      }
    }
  }
  return out.slice(0, limit)
}
```

- [ ] **Step 2: Create `src/components/VideoPlayer.tsx`**

```tsx
'use client'

import { useState } from 'react'

import type { Media } from '@/payload-types'
import { embedUrl } from '@/lib/video'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'

function PlayOverlay() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20">
        <PlayIcon className="ms-1" width={36} height={36} />
      </span>
    </span>
  )
}

/**
 * Watch-page video facade: large thumbnail + play button; the embed <iframe> loads
 * ONLY on click (CWV-safe). Unknown hosts (no embed) fall back to an external link.
 */
export function VideoPlayer({
  videoUrl,
  thumbnail,
  title,
}: {
  videoUrl: string
  thumbnail: number | Media | null | undefined
  title: string
}) {
  const [playing, setPlaying] = useState(false)
  const src = embedUrl(videoUrl)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-brand-900">
      {playing && src ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`${src}?autoplay=1`}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          {src ? (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`تشغيل: ${title}`}
              className="absolute inset-0 cursor-pointer"
            >
              <PlayOverlay />
            </button>
          ) : (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`مشاهدة: ${title}`}
              className="absolute inset-0"
            >
              <PlayOverlay />
            </a>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the watch page**

Create `src/app/(frontend)/videos/[slugId]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { VideoPlayer } from '@/components/VideoPlayer'
import { VideoSection } from '@/components/VideoSection'
import { formatDate } from '@/lib/format'
import { getRelatedVideos, getSiteConfig, getVideoById } from '@/lib/queries'
import { categoryUrl, idFromSlugParam, videoWatchUrl } from '@/lib/routes'
import { breadcrumbJsonLd, buildMetadata, ogImageUrl, videoObjectJsonLd } from '@/lib/seo'
import type { Category } from '@/payload-types'

export const revalidate = 3600

type Props = { params: Promise<{ slugId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slugId } = await params
  const id = idFromSlugParam(slugId)
  if (id === null) return {}
  const video = await getVideoById(id)
  if (!video) return {}
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: video.seo?.metaTitle || video.title,
    description: video.seo?.metaDescription || video.description,
    path: videoWatchUrl(video),
    image: ogImageUrl(video.seo?.ogImage || video.thumbnail, cfg.defaultOgImage),
    canonicalOverride: video.seo?.canonicalURL,
    noIndex: video.seo?.noIndex ?? undefined,
  })
}

export default async function VideoWatchPage({ params }: Props) {
  const { slugId } = await params
  const id = idFromSlugParam(slugId)
  if (id === null) notFound()

  const video = await getVideoById(id)
  if (!video) notFound()

  const related = await getRelatedVideos(video)
  const category =
    video.category && typeof video.category === 'object' ? (video.category as Category) : null

  return (
    <main>
      <JsonLd data={videoObjectJsonLd(video)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'فيديو', url: categoryUrl('video') },
          { name: video.title, url: videoWatchUrl(video) },
        ])}
      />

      <div className="lf-container py-8">
        <nav aria-label="مسار التنقل" className="mb-4 text-sm text-zinc-500">
          <Link href="/" className="hover:text-brand-600">
            الرئيسية
          </Link>
          {' / '}
          <Link href={categoryUrl('video')} className="hover:text-brand-600">
            فيديو
          </Link>
        </nav>

        <div className="mx-auto max-w-4xl">
          <VideoPlayer videoUrl={video.videoUrl} thumbnail={video.thumbnail} title={video.title} />
          <div className="mt-4">
            {category && (
              <Link
                href={categoryUrl(category.slug ?? '')}
                className="text-sm font-bold text-brand-600 hover:underline"
              >
                {category.name}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-extrabold text-zinc-900">{video.title}</h1>
            {video.publishedAt && (
              <time
                dateTime={new Date(video.publishedAt).toISOString()}
                className="mt-1 block text-sm text-zinc-500"
              >
                {formatDate(video.publishedAt)}
              </time>
            )}
            {video.description && (
              <p className="mt-3 leading-relaxed whitespace-pre-line text-zinc-700">{video.description}</p>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && <VideoSection videos={related} title="مقاطع ذات صلة" />}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/components/VideoPlayer.tsx "src/app/(frontend)/videos/[slugId]/page.tsx"
git commit -m "feat(videos): watch page + VideoPlayer + related/by-id queries"
```

---

### Task 3: Point cards at the watch page + move VideoObject off the homepage

Now the destination exists, refactor `VideoCard` to navigate, and relocate the `VideoObject` JSON-LD.

**Files:**
- Modify: `src/components/VideoCard.tsx` (full rewrite to a navigational server component)
- Modify: `src/app/(frontend)/page.tsx` (remove the per-video VideoObject block + now-unused imports)

**Interfaces:**
- Consumes: `videoWatchUrl` (Task 1); the `/videos/[slugId]` route (Task 2); `PostImage`, `PlayIcon`.
- Produces: `VideoCard` links to `videoWatchUrl(video)` (same `'lead'`/`'list'` props, no inline play).

- [ ] **Step 1: Rewrite `VideoCard.tsx`**

Replace the entire file `src/components/VideoCard.tsx` with:

```tsx
import Link from 'next/link'

import type { Video } from '@/payload-types'
import { videoWatchUrl } from '@/lib/routes'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'

type Variant = 'lead' | 'list'

function PlayButton({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-300 group-hover:scale-105"
    >
      <span
        className={`grid place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20 ${
          large ? 'h-16 w-16' : 'h-10 w-10'
        }`}
      >
        <PlayIcon className="ms-0.5" width={large ? 30 : 20} height={large ? 30 : 20} />
      </span>
    </span>
  )
}

function Duration({ value }: { value?: string | null }) {
  if (!value) return null
  return (
    <span className="absolute bottom-2 end-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
      {value}
    </span>
  )
}

/**
 * Video thumbnail that LINKS to the watch page (/videos/<slug>-<id>). The embed
 * itself lives on the watch page (VideoPlayer), so cards are navigational only —
 * a plain server component. Always rendered inside the dark VideoSection band.
 */
export function VideoCard({ video, variant = 'list' }: { video: Video; variant?: Variant }) {
  const isLead = variant === 'lead'
  const sizes = isLead ? '(max-width: 768px) 100vw, 50vw' : '160px'
  const href = videoWatchUrl(video)

  const frame = (
    <Link
      href={href}
      className="relative block aspect-video w-full overflow-hidden rounded-xl bg-brand-900"
    >
      <PostImage
        image={video.thumbnail}
        alt={video.title}
        sizes={sizes}
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <PlayButton large={isLead} />
      <Duration value={video.duration} />
    </Link>
  )

  if (isLead) {
    return (
      <article className="group">
        {frame}
        <h3 className="mt-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          <Link href={href}>{video.title}</Link>
        </h3>
        {video.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/70">{video.description}</p>
        )}
      </article>
    )
  }

  return (
    <article className="group flex items-start gap-3">
      <div className="w-40 flex-none">{frame}</div>
      <div className="min-w-0 pt-1">
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white/90 group-hover:text-brand-200">
          <Link href={href}>{video.title}</Link>
        </h3>
        {video.duration && (
          <span className="mt-1 block text-xs text-white/50 tabular-nums">{video.duration}</span>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Remove the homepage VideoObject block**

In `src/app/(frontend)/page.tsx`:

1. Delete the import `import { JsonLd } from '@/components/JsonLd'` (it's only used by the block being removed).
2. Change `import { buildMetadata, ogImageUrl, videoObjectJsonLd } from '@/lib/seo'` to `import { buildMetadata, ogImageUrl } from '@/lib/seo'`.
3. Remove the VideoObject emission block at the top of the returned `<main>` — delete these lines:

```tsx
      {/* VideoObject requires a thumbnailUrl — only emit for videos that have one. */}
      {videos
        .filter((v) => v.thumbnail && typeof v.thumbnail === 'object' && v.thumbnail.url)
        .map((v) => (
          <JsonLd key={v.id} data={videoObjectJsonLd(v)} />
        ))}
```

so the render begins:

```tsx
  return (
    <main>
      <HeroFeature posts={heroPosts} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: no errors (no unused-import warnings — both removed).

- [ ] **Step 4: Commit**

```bash
git add src/components/VideoCard.tsx "src/app/(frontend)/page.tsx"
git commit -m "feat(videos): cards link to watch pages; move VideoObject off homepage"
```

---

### Task 4: Sitemap + e2e + build

Wire video URLs into the sitemap and prove the flow. **The subagent writes the code + e2e spec and runs the build; the controller runs the e2e** (dev server; 5 videos already seeded).

**Files:**
- Modify: `src/app/(frontend)/sitemap.xml/route.ts`
- Create: `tests/e2e/videos.e2e.spec.ts`

**Interfaces:**
- Consumes: `videoWatchUrl` (Task 1); the `/videos/[slugId]` route (Task 2); the card links (Task 3).
- Produces: video watch URLs in the sitemap; the e2e spec.

- [ ] **Step 1: Add video URLs to the sitemap**

In `src/app/(frontend)/sitemap.xml/route.ts`, extend the routes import to add `videoWatchUrl`:

```ts
import { postUrl, categoryUrl, authorUrl, magazineArchiveUrl, magazineIssueUrl, videoWatchUrl } from '@/lib/routes'
```

Add a `videos` fetch to the `Promise.all` (alongside posts/categories/issues) and destructure it:

```ts
    payload.find({
      collection: 'videos',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 500,
      depth: 0,
    }),
```

(destructure as `const [posts, categories, issues, videos] = await Promise.all([...])`.)

Then, after the magazine block (before the final `const xml = …`), append:

```ts
  for (const v of videos.docs) {
    urls.push(urlTag(absoluteUrl(videoWatchUrl(v)), v.updatedAt ?? undefined))
  }
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint && npx pnpm@10.18.0 build`
Expected: all clean. `/videos/[slugId]` is dynamic (`ƒ`); the homepage stays static (`○`). No `cookies()`/dynamic-server-usage errors.

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/videos.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Video watch pages', () => {
  test('homepage band card → watch page plays + shows related', async ({ page }) => {
    await page.goto(BASE)

    // The homepage video band cards link to /videos/<slug>-<id>.
    const card = page.locator('a[href^="/videos/"]').first()
    await expect(card).toBeVisible()
    const href = await card.getAttribute('href')
    expect(href).toMatch(/^\/videos\/.+-\d+$/)

    await page.goto(`${BASE}${decodeURI(href!)}`)
    await expect(page.locator('h1')).toBeVisible()

    // Facade: play button present, iframe absent until click.
    await expect(page.locator('iframe')).toHaveCount(0)
    const play = page.getByRole('button', { name: /تشغيل/ })
    await expect(play).toBeVisible()
    await play.click()
    await expect(page.locator('iframe')).toBeVisible()

    // Related rail renders.
    await expect(page.getByText('مقاطع ذات صلة')).toBeVisible()
  })
})
```

- [ ] **Step 4: Commit (implementer stops here)**

```bash
git add "src/app/(frontend)/sitemap.xml/route.ts" tests/e2e/videos.e2e.spec.ts
git commit -m "feat(videos): sitemap watch URLs + e2e coverage"
```

- [ ] **Step 5: (Controller) Run the e2e + manual checks**

The controller performs these live steps (subagent does NOT):
1. Start the dev server, wait for `:3000`, run: `npx pnpm@10.18.0 exec playwright test --config=playwright.config.ts tests/e2e/videos.e2e.spec.ts` → expect PASS. (5 published videos already exist.)
2. Manual confirm (curl/Playwright MCP): a homepage band card `href="/videos/…"`; the watch page emits `"@type":"VideoObject"` JSON-LD and the homepage no longer does; the sitemap lists `/videos/…` URLs; thumbnails make 0 `/_next/image` requests.

---

## Self-Review

**Spec coverage:**
- `/videos/[slugId]` watch page, id-lookup, 404 on bad/missing → Task 2. ✓
- Facade `VideoPlayer` (embed on click) → Task 2. ✓
- `VideoObject` + breadcrumb JSON-LD on the watch page → Task 2. ✓
- Related rail reusing `VideoSection` (full-bleed, outside `.lf-container`) → Task 2. ✓
- `embedUrl` → `lib/video.ts`; `videoWatchUrl` helper; `getVideoById`/`getRelatedVideos` → Tasks 1-2. ✓
- `VideoCard` → links to watch page (drops inline play/'use client'/embedUrl) → Task 3. ✓
- Remove homepage per-video `VideoObject` → Task 3. ✓
- Sitemap video URLs → Task 4. ✓
- URL `/videos/<slug>-<id>` (plural, avoids category collision), `idFromSlugParam` parse → Tasks 1-2, unit-tested. ✓
- ISR (`revalidate=3600`, no `cookies()`), covers via `PostImage`, published-only queries → Tasks 2-3, asserted in Task 4 build. ✓
- Unit (embedUrl + videoWatchUrl) → Task 1. e2e (card→watch→play→related) → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete; no new seed needed (5 videos exist). ✓

**Type consistency:** `embedUrl`, `videoWatchUrl`, `getVideoById`, `getRelatedVideos`, `VideoPlayer({videoUrl,thumbnail,title})`, `VideoCard({video,variant})` names/signatures match across defining and consuming tasks. `idFromSlugParam` reused unchanged. `Video`/`Category`/`Media` imports consistent. ✓

**Out of scope (unchanged from spec):** `/videos` index, playlists/comments/view-counts, mismatched-slug 301, and the other three Phase 6 sub-projects (search/newsletter/push).
