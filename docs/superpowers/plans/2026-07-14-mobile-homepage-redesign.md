# Mobile Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the homepage a mobile-first, image-forward layout below `md` (768px): the hero posts stack as big posters one after another, and every section + the video band become swipe carousels with dot indicators. Desktop (`md+`) is byte-for-byte unchanged.

**Architecture:** One new client component, `Carousel`, wraps server-rendered cards and shows one per screen on mobile (CSS scroll-snap) while collapsing to the existing desktop grid at `md+` — same DOM, no duplicate images. A tiny `IntersectionObserver` drives a decorative dot row (mobile-only). `SectionBlock` uses `Carousel` as a single responsive DOM. `HeroFeature`, `LeadListBlock`, and `VideoSection` keep their existing desktop markup in a `hidden md:block`/`md:grid` branch and add a `md:hidden` mobile branch (their desktop layouts are lead/list splits that can't share a flat DOM). `PostCard`'s `overlay` variant becomes responsive (4:5 poster + small title on mobile; unchanged at `md+`) and gains an optional `priority` override so only the LCP lead eager-loads.

**Tech Stack:** Next.js App Router (RSC + client components), React, Tailwind CSS v4 (RTL, logical properties), Playwright (e2e), Vitest + @testing-library/react + jsdom (unit).

## Global Constraints

- **RTL-first.** Use logical properties (`ps/pe/ms/me`, `start/end`) and direction-agnostic APIs (`scroll-snap`, `IntersectionObserver`). Never hardcode `left`/`right`.
- **The mobile/desktop line is `md` (768px).** Everything `md:` and up must render exactly as it does today. New behavior lives below `md`.
- **No new dependencies.** Carousel is CSS scroll-snap + one `IntersectionObserver`; no carousel library.
- **Brand accent** is `brand-600` (`#bc0168`); dark video band is `.lf-band-dark`.
- **Container** is `.lf-container` (max 1296px, `padding-inline`).
- **Only the LCP hero lead image is `priority`.** All other images lazy-load.
- **Scope:** homepage components only. No data/query/layout-route changes.

---

### Task 1: `Carousel` client component

**Files:**
- Create: `src/components/Carousel.tsx`
- Test: `tests/int/carousel.int.spec.tsx`

**Interfaces:**
- Consumes: nothing (leaf component).
- Produces:
  ```ts
  export function Carousel(props: {
    children: React.ReactNode
    dotColor?: 'dark' | 'light'   // default 'dark'
    slideClassName?: string        // default 'basis-[85%]' (mobile flex-basis; leaves a peek)
    trackClassName?: string        // default '' (desktop grid cols, e.g. 'md:grid-cols-4')
  }): JSX.Element
  ```
  Renders `data-testid="mobile-carousel"` wrapping a `data-testid="carousel-track"` scroll-snap track and (when >1 child) a `md:hidden` dot row of `data-testid="carousel-dot"` spans, each with `data-active="true"|"false"`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/int/carousel.int.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'

import { Carousel } from '@/components/Carousel'

beforeAll(() => {
  // jsdom has no IntersectionObserver; stub it so the effect can construct one.
  class IO {
    constructor(_cb: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

afterEach(() => cleanup())

describe('Carousel', () => {
  it('renders one dot per child, first active', () => {
    render(
      <Carousel>
        <div>one</div>
        <div>two</div>
        <div>three</div>
      </Carousel>,
    )
    const dots = screen.getAllByTestId('carousel-dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].getAttribute('data-active')).toBe('true')
    expect(dots[1].getAttribute('data-active')).toBe('false')
  })

  it('renders no dots for a single child', () => {
    render(
      <Carousel>
        <div>only</div>
      </Carousel>,
    )
    expect(screen.queryAllByTestId('carousel-dot')).toHaveLength(0)
  })

  it('wraps each child as a slide inside the track', () => {
    render(
      <Carousel>
        <div>one</div>
        <div>two</div>
      </Carousel>,
    )
    const track = screen.getByTestId('carousel-track')
    expect(track.children).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int tests/int/carousel.int.spec.tsx`
Expected: FAIL — `Failed to resolve import "@/components/Carousel"` (module does not exist yet).

- [ ] **Step 3: Implement the component**

Create `src/components/Carousel.tsx`:

```tsx
'use client'

import { Children, useEffect, useRef, useState } from 'react'

/**
 * Mobile swipe carousel. Below `md` it's a horizontal scroll-snap track showing one
 * card at a time (with a peek of the next); at `md+` it becomes the grid given by
 * `trackClassName`, so the SAME DOM is the desktop grid — no duplicate images.
 * A mobile-only, decorative dot row tracks the active slide via one
 * IntersectionObserver. RTL-safe: scroll-snap + IO are both direction-agnostic.
 */
export function Carousel({
  children,
  dotColor = 'dark',
  slideClassName = 'basis-[85%]',
  trackClassName = '',
}: {
  children: React.ReactNode
  dotColor?: 'dark' | 'light'
  slideClassName?: string
  trackClassName?: string
}) {
  const items = Children.toArray(children)
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track || items.length < 2) return
    const slides = Array.from(track.children) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        let best = -1
        let bestRatio = 0
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio
            best = slides.indexOf(e.target as HTMLElement)
          }
        }
        if (best >= 0) setActive(best)
      },
      { root: track, threshold: [0.5, 0.75, 1] },
    )
    slides.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [items.length])

  return (
    <div data-testid="mobile-carousel">
      <div
        ref={trackRef}
        data-testid="carousel-track"
        className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:gap-6 md:overflow-visible ${trackClassName}`}
      >
        {items.map((child, i) => (
          <div key={i} className={`shrink-0 snap-center ${slideClassName} md:basis-auto`}>
            {child}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div aria-hidden className="mt-4 flex justify-center gap-2 md:hidden">
          {items.map((_, i) => (
            <span
              key={i}
              data-testid="carousel-dot"
              data-active={i === active ? 'true' : 'false'}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === active
                  ? dotColor === 'light'
                    ? 'bg-white'
                    : 'bg-brand-600'
                  : dotColor === 'light'
                    ? 'bg-white/40'
                    : 'bg-zinc-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int tests/int/carousel.int.spec.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/Carousel.tsx tests/int/carousel.int.spec.tsx
git commit -m "feat(mobile): add Carousel client component with scroll-snap + dots"
```

---

### Task 2: `PostCard` overlay — responsive poster + `priority` override

**Files:**
- Modify: `src/components/PostCard.tsx`
- Test: `tests/int/postcard-overlay.int.spec.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PostCard` gains an optional prop `priority?: boolean`. New signature:
  ```ts
  export function PostCard(props: {
    post: Post
    variant?: 'default' | 'hero' | 'overlay' | 'compact' | 'lead'
    fill?: boolean
    priority?: boolean   // overrides the per-variant default eager-load
  }): JSX.Element
  ```
  The `overlay` variant renders a 4:5 poster with a small (`text-lg`) title below `md`, and the current 16:9/fill overlay with a `text-3xl` title at `md+`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/int/postcard-overlay.int.spec.tsx`:

```tsx
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'

// next/link needs no router when we render it as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

import { PostCard } from '@/components/PostCard'

// Minimal Post; image=null exercises PostImage's placeholder (no next/image needed).
const post = {
  id: 1,
  title: 'عنوان تجريبي',
  slug: 'test',
  category: null,
  featuredImage: null,
  featuredType: 'image',
  publishedAt: '2026-01-01T00:00:00.000Z',
  _status: 'published',
} as unknown as import('@/payload-types').Post

afterEach(() => cleanup())

describe('PostCard overlay variant', () => {
  it('is a 4:5 poster with a small overlaid title on mobile (upgrades at md+)', () => {
    const { container } = render(<PostCard post={post} variant="overlay" fill />)
    const article = container.querySelector('article')!
    expect(article.className).toContain('aspect-[4/5]')
    expect(article.className).toContain('md:aspect-video')
    const heading = container.querySelector('h2')!
    expect(heading.className).toContain('text-lg')
    expect(heading.className).toContain('md:text-3xl')
  })

  it('non-fill overlay is also a 4:5 poster', () => {
    const { container } = render(<PostCard post={post} variant="overlay" />)
    expect(container.querySelector('article')!.className).toContain('aspect-[4/5]')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int tests/int/postcard-overlay.int.spec.tsx`
Expected: FAIL — the article className still contains `aspect-video` (not `aspect-[4/5]`) and the `<h2>` is `text-2xl sm:text-3xl` (no `text-lg`).

- [ ] **Step 3: Implement the changes**

In `src/components/PostCard.tsx`:

3a. Update the signature and add a shared priority default. Replace the function header (lines ~58-72) so it reads:

```tsx
export function PostCard({
  post,
  variant = 'default',
  fill = false,
  priority,
}: {
  post: Post
  variant?: Variant
  /** Overlay only: stretch to the parent's height instead of a fixed 16:9 ratio. */
  fill?: boolean
  /** Override the per-variant eager-load default (e.g. false for below-fold posters). */
  priority?: boolean
}) {
  const category = categoryOf(post)
  const exclusive = isExclusive(category)
  const isVideo = isVideoPost(post)
  const href = postUrl(post)
  // By default overlay/lead/hero eager-load; callers can force false (e.g. the
  // stacked mobile hero secondaries, which sit below the fold).
  const eager = priority ?? (variant === 'overlay' || variant === 'lead' || variant === 'hero')
```

3b. In the `overlay` block, change the `<article>` aspect classes and the `<h2>` size, and use `eager`:

```tsx
  // Overlay: text sits over the image. Mobile = 4:5 poster w/ small title; md+ unchanged.
  if (variant === 'overlay') {
    return (
      <article
        className={`group relative overflow-hidden rounded-xl ${
          fill
            ? 'aspect-[4/5] md:aspect-video lg:aspect-auto lg:h-full'
            : 'aspect-[4/5] md:aspect-video'
        }`}
      >
        {exclusive && <ExclusiveBadge />}
        {isVideo && <PlayBadge />}
        <PostImage
          image={post.featuredImage}
          alt={post.title}
          sizes="(max-width: 768px) 100vw, 66vw"
          priority={eager}
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <Kicker category={category} light />
          <h2 className="mt-2 text-lg font-bold leading-tight text-white drop-shadow md:text-3xl">
            <Link href={href} className="after:absolute after:inset-0">
              {post.title}
            </Link>
          </h2>
          <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-white/70" />
        </div>
      </article>
    )
  }
```

3c. In the `lead` block, replace `priority` on its `<PostImage>` with `priority={eager}` (behavior unchanged — `eager` defaults true for `lead`).

3d. In the final `default`/`hero` block, replace the `<PostImage>`'s `priority={isHero}` with `priority={eager}` (unchanged — `eager` is `isHero` for these two variants).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int tests/int/postcard-overlay.int.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck the change**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/PostCard.tsx tests/int/postcard-overlay.int.spec.tsx
git commit -m "feat(mobile): overlay PostCard becomes 4:5 poster w/ small title + priority override"
```

---

### Task 3: `HeroFeature` — stacked mobile posters

**Files:**
- Modify: `src/components/HeroFeature.tsx`

**Interfaces:**
- Consumes: `PostCard` (`overlay`/`fill`/`priority` from Task 2).
- Produces: a `<section data-testid="hero">` whose mobile branch stacks the hero posts as overlay posters; `md+` renders the current flanked grid unchanged.

- [ ] **Step 1: Rewrite the component**

Replace the body of `src/components/HeroFeature.tsx` with:

```tsx
import type { Post } from '@/payload-types'
import { PostCard } from './PostCard'

/**
 * Homepage hero.
 * - Mobile (<md): the hero posts stack one after another as big 4:5 overlay posters.
 * - Desktop (md+): one large overlay lead beside a 2×2 grid of the next stories
 *   (unchanged). The lead card is shared across both branches — one image, keeping
 *   LCP priority; only the below-fold secondaries duplicate between branches.
 */
export function HeroFeature({ posts }: { posts: Post[] }) {
  if (!posts.length) return null
  const [lead, ...rest] = posts
  const secondary = rest.slice(0, 4)

  return (
    <section data-testid="hero">
      <div className="lf-container py-6 md:grid md:grid-cols-1 md:items-stretch md:gap-6 md:py-8 lg:grid-cols-12">
        {/* Lead — shared. Full width on mobile; col-span-7 at lg. Keeps LCP priority. */}
        <div className="lg:col-span-7">
          <PostCard post={lead} variant="overlay" fill />
        </div>

        {/* Mobile (<md): the remaining hero posts as big stacked posters. */}
        {secondary.length > 0 && (
          <div className="mt-6 flex flex-col gap-6 md:hidden">
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} variant="overlay" priority={false} />
            ))}
          </div>
        )}

        {/* Desktop (md+): the original flanked 2×2 grid. Unchanged. */}
        {secondary.length > 0 && (
          <div className="hidden grid-cols-2 gap-6 md:grid lg:col-span-5">
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HeroFeature.tsx
git commit -m "feat(mobile): hero stacks posts as big posters below md; desktop unchanged"
```

---

### Task 4: `SectionBlock` — single-DOM carousel

**Files:**
- Modify: `src/components/SectionBlock.tsx`

**Interfaces:**
- Consumes: `Carousel` (Task 1), `PostCard`.
- Produces: the section's card row is a swipe carousel below `md` and the current 4-col grid at `md+` (same DOM).

- [ ] **Step 1: Rewrite the card row**

In `src/components/SectionBlock.tsx`, add `import { Carousel } from './Carousel'` and replace the `<div className="grid grid-cols-2 gap-6 md:grid-cols-4">…</div>` with:

```tsx
        <Carousel trackClassName="md:grid-cols-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </Carousel>
```

(Leave the surrounding `<section>`, `.lf-container`, `SectionHeading`, and `band` logic untouched.)

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SectionBlock.tsx
git commit -m "feat(mobile): SectionBlock rows become swipe carousels below md"
```

---

### Task 5: `LeadListBlock` — mobile carousel + unchanged desktop

**Files:**
- Modify: `src/components/LeadListBlock.tsx`

**Interfaces:**
- Consumes: `Carousel` (Task 1), `PostCard`.
- Produces: a `md:hidden` carousel of the section's posts and a `hidden md:block` branch holding the current lead/list split.

- [ ] **Step 1: Rewrite the body**

Replace the `return (…)` in `src/components/LeadListBlock.tsx` (keep the imports plus the `const [lead, ...rest] = posts` / `const list = rest.slice(0, 4)` lines) and add `import { Carousel } from './Carousel'`:

```tsx
  return (
    <section className={band ? 'lf-band' : ''}>
      <div className="lf-container py-12">
        <SectionHeading title={title || category.name} href={categoryUrl(category.slug ?? '')} />

        {/* Mobile (<md): swipe carousel of the section's posts. */}
        <div className="md:hidden">
          <Carousel>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </Carousel>
        </div>

        {/* Desktop (md+): the original lead + stacked list. Unchanged. */}
        <div className="hidden md:block">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PostCard post={lead} variant="lead" />
            {list.length > 0 && (
              <div className="flex flex-col gap-5">
                {list.map((post) => (
                  <PostCard key={post.id} post={post} variant="compact" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LeadListBlock.tsx
git commit -m "feat(mobile): LeadListBlock becomes a carousel below md; desktop unchanged"
```

---

### Task 6: `VideoSection` — mobile carousel with light dots

**Files:**
- Modify: `src/components/VideoSection.tsx`

**Interfaces:**
- Consumes: `Carousel` (Task 1, `dotColor="light"`), `VideoCard`.
- Produces: a `md:hidden` carousel of `VideoCard variant="lead"` slides on the dark band, and a `hidden md:block` branch holding the current lead/list split.

- [ ] **Step 1: Rewrite the body**

Replace the `return (…)` in `src/components/VideoSection.tsx` (keep the `const [lead, ...rest] = videos` / `const list = rest.slice(0, 4)` lines) and add `import { Carousel } from './Carousel'`:

```tsx
  return (
    <section className="lf-band-dark text-white">
      <div className="lf-container py-12">
        <SectionHeading title={title} href={videosListingUrl()} light />

        {/* Mobile (<md): swipe carousel of video cards, light dots for the dark band. */}
        <div className="md:hidden">
          <Carousel dotColor="light">
            {videos.map((post) => (
              <VideoCard key={post.id} post={post} variant="lead" />
            ))}
          </Carousel>
        </div>

        {/* Desktop (md+): the original lead + stacked list. Unchanged. */}
        <div className="hidden md:block">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <VideoCard post={lead} variant="lead" />
            {list.length > 0 && (
              <div className="flex flex-col gap-4">
                {list.map((post) => (
                  <VideoCard key={post.id} post={post} variant="list" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoSection.tsx
git commit -m "feat(mobile): VideoSection becomes a carousel below md; desktop unchanged"
```

---

### Task 7: End-to-end mobile behavior spec

**Files:**
- Create: `tests/e2e/mobile-home.e2e.spec.ts`

**Interfaces:**
- Consumes: the rendered homepage (`data-testid` hooks `hero`, `mobile-carousel`, `carousel-track`, `carousel-dot`) from Tasks 1–6, plus `.lf-band-dark` on the video band.
- Produces: nothing (verification only).

**Precondition:** a dev server with seeded/migrated content is reachable at `http://localhost:3000` (Playwright's `webServer` starts `pnpm dev` and reuses an existing one). The homepage needs published posts, at least one configured section, and (for the video test) at least one video-post.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/mobile-home.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

test.describe('Mobile homepage redesign', () => {
  test('hero renders stacked overlay posters on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE)
    // Overlay posters use <h2>; the shared lead + stacked secondaries => >= 2 visible.
    const heroHeadings = page.getByTestId('hero').locator('h2')
    expect(await heroHeadings.count()).toBeGreaterThanOrEqual(2)
    await expect(heroHeadings.first()).toBeVisible()
  })

  test('sections are swipe carousels with dots on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE)
    const carousel = page.getByTestId('mobile-carousel').first()
    await expect(carousel).toBeVisible()
    await expect(carousel.getByTestId('carousel-track')).toBeVisible()
    const dots = carousel.getByTestId('carousel-dot')
    expect(await dots.count()).toBeGreaterThan(1)
    await expect(dots.first()).toHaveAttribute('data-active', 'true')
  })

  test('bringing the next slide into view advances the active dot', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE)
    const carousel = page.getByTestId('mobile-carousel').first()
    const slides = carousel.getByTestId('carousel-track').locator(':scope > div')
    test.skip((await slides.count()) < 2, 'need >= 2 slides')
    // RTL-safe: scroll the 2nd slide into view rather than computing scrollLeft.
    await slides.nth(1).scrollIntoViewIfNeeded()
    await expect(carousel.getByTestId('carousel-dot').nth(1)).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('video band is a carousel on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE)
    const band = page.locator('.lf-band-dark')
    test.skip((await band.count()) === 0, 'no video band on the homepage')
    await expect(band.getByTestId('mobile-carousel')).toBeVisible()
  })

  test('desktop shows grids with carousel dots hidden', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(BASE)
    const dots = page.getByTestId('carousel-dot')
    if (await dots.count()) {
      await expect(dots.first()).toBeHidden()
    }
    // Desktop hero secondaries are <h3> default cards (mobile posters are <h2>, hidden).
    await expect(page.getByTestId('hero').locator('h3').first()).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the spec**

Run: `npx pnpm@10.18.0 run test:e2e mobile-home.e2e.spec.ts`
Expected: PASS (5 tests; the swipe/video tests self-skip if the seeded data lacks enough slides or a video band).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/mobile-home.e2e.spec.ts
git commit -m "test(mobile): e2e for stacked hero + swipe carousels + hidden desktop dots"
```

---

### Task 8: Manual verification + lint

**Files:** none (verification only).

- [ ] **Step 1: Lint the whole change**

Run: `npx pnpm@10.18.0 run lint`
Expected: no new errors/warnings in the touched files.

- [ ] **Step 2: Visually verify with the running dev server**

Start dev (`npx pnpm@10.18.0 run dev`) and, at a 390px-wide viewport, confirm on `/`:
- Hero: the hero posts appear as big 4:5 posters, stacked one after another, each with a small overlaid title over the image (image dominant).
- Each section: one card per screen with a peek of the next card's edge; swiping moves to the next and the active dot updates; dots are centered under the row.
- Video band (dark): same one-at-a-time swipe with light-colored dots and play badges.
- Resize to ≥768px: the hero flanked grid, 4-col section grids, and video lead/list all render exactly as before; no dots visible.

- [ ] **Step 3: Confirm no regressions in the existing suites**

Run: `npx pnpm@10.18.0 run test:int`
Expected: PASS (existing int tests plus the two new ones from Tasks 1–2).

---

## Notes / accepted trade-offs

- **Duplicated below-fold images.** `HeroFeature` (4 secondaries), `LeadListBlock`, and `VideoSection` render their posts in both a `md:hidden` mobile branch and a `hidden md:*` desktop branch, so those images exist twice in the DOM; a mobile browser may fetch the hidden desktop copies. They are below the fold and lazy-loaded, and the hero **lead** (the LCP image) is shared — rendered once — so the largest image never double-loads. `SectionBlock` (the block that repeats many times) uses a single responsive DOM via `Carousel`, so it never duplicates.
- **Dots are decorative** (`aria-hidden`, non-interactive). Swiping/scrolling is the control; the cards remain real, keyboard-reachable links. No programmatic scroll means the existing global `prefers-reduced-motion` rule already covers motion concerns.
