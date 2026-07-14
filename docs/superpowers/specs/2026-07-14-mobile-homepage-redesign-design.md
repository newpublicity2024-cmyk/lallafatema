# Mobile Homepage Redesign — Design

**Date:** 2026-07-14
**Scope:** Homepage only, mobile viewports only (`< md` / 768px). Desktop (`md+`) is untouched.

## Problem

The current mobile homepage is the desktop layout with its grids collapsed to 1–2
columns. It does not leverage the imagery: the site is an image-heavy Arabic
celebrity/lifestyle magazine (RTL), but on a phone the hero and section grids feel
like a shrunk desktop rather than a native mobile magazine.

## Goal

A mobile-first, **image-forward, one-thing-at-a-time** homepage:

1. **Hero** — the hero posts are listed **one after another** vertically, each a
   big image with a small overlaid title (image emphasized).
2. **Sections** — each category section becomes a **swipe carousel** showing its
   articles one at a time, with dot indicators.
3. **Video band** — same carousel treatment on the dark band.

## Non-goals

- No desktop changes. All new behavior is gated below `md` (768px).
- No changes to category/listing pages, article pages, or any data/query layer.
- No new dependencies. Carousel is CSS scroll-snap + a tiny observer, not a library.

## Guiding rule

Everything below `md` (768px) gets the new experience. At `md` and up, the existing
desktop markup renders exactly as today. Where mobile and desktop share the same
card structure, a **single responsive DOM** is used (no duplicate images). Where the
structure genuinely differs (hero secondary), two branches are toggled with
`md:hidden` / `hidden md:*`.

RTL note: this is an RTL site. Use logical properties (`ps/pe/ms/me`, `start/end`)
and `scroll-snap` which is direction-aware; never hardcode left/right. A peeking
"next card" edge sits at the **inline-end** (visually the left, in RTL).

---

## 1. Hero — vertical stack of big posters (mobile)

On mobile the hero renders as a **vertical list**: each hero post (up to 5) is a
full-width **overlay card**, stacked one after another down the page.

### Card anatomy (mobile hero card)
- Big image, **4:5 portrait** ratio ("poster" feel).
- Kicker (category link) + **small title** overlaid at the bottom-start, over a
  **light/short** bottom gradient so the image stays dominant.
- Title sized small — approx `text-lg font-semibold` (contrast vs the current
  desktop `text-2xl`/`text-3xl` overlay). Not truncated to a single line; allow up
  to ~2 lines.
- Video posts keep the centered play badge; exclusive posts keep the "حصري" pill.
- The **lead** (first) card keeps `priority` for LCP; the rest lazy-load.

### DOM / breakpoint strategy
- The **lead** card is `overlay` on both mobile and desktop, so it is a single
  shared card in a responsive container (one image, no duplication).
- The **4 secondary** cards differ structurally: mobile = big overlay poster,
  desktop = small "title-below" default card. These render as **two branches**:
  - Mobile branch: `md:hidden`, stacked full-width overlay posters.
  - Desktop branch: `hidden md:grid`, the current 2×2 grid of default cards.
- **Accepted trade-off:** the 4 secondary images exist in both branches, so on a
  phone the 4 hidden-desktop images may also be fetched. They are below the fold and
  lazy-loaded, so the cost is small. Documented deliberately.

### Desktop (unchanged)
The current `HeroFeature` desktop layout — 7-col overlay lead + 5-col 2×2 secondary
grid — renders unchanged at `md+`.

---

## 2. Sections → swipe carousels (mobile)

`SectionBlock` and `LeadListBlock` keep their `SectionHeading`. The card row becomes
a **carousel on mobile**:

- One card per screen, `scroll-snap-type: x mandatory`, snap-center children.
- A **peek** of the next card's edge at the inline-end signals swipeability.
- A row of **dots** under the track shows position and the active slide.
- Smooth momentum scroll; `prefers-reduced-motion` disables smooth scrolling.

### DOM / breakpoint strategy (single responsive DOM — no duplication)
The same `PostCard`s are reused. The track element is:
- Mobile: `flex snap-x snap-mandatory overflow-x-auto` with each child
  `basis-[85%] shrink-0 snap-center` (85% leaves the peek).
- Desktop: `md:grid md:grid-cols-4 md:overflow-visible` and children reset to
  `md:basis-auto` — i.e. the exact current grid.
Dots are rendered `md:hidden`.

`LeadListBlock` on mobile: the lead + compact list also collapse into the same
carousel of cards (each post one slide) rather than the desktop lead/stacked split.
(Simplest and consistent; the lead/list split is a desktop affordance.)

---

## 3. Video band → swipe carousel (mobile)

`VideoSection` (dark `lf-band-dark`) gets the same carousel: `VideoCard`s one at a
time, magenta play badge preserved. Dots use a **light** color for contrast on the
dark band. Reuses the same `<Carousel>` component and the same responsive-DOM
approach (mobile snap flex / desktop 2-col grid).

---

## Components

### New: `src/components/Carousel.tsx` (client component)
A reusable mobile carousel wrapper.

- **Props:** `children` (server-rendered cards, passed through), optional
  `dotColor` (`'dark' | 'light'`, default dark) for band contrast, optional
  `className`, and the responsive track/grid classes (or sensible defaults baked in).
- **Behavior:**
  - Renders a scroll-snap track that is a carousel on mobile and the normal grid on
    desktop (via responsive utility classes on the track + child wrappers).
  - Renders a `md:hidden` dot row. One dot per child.
  - A single `IntersectionObserver` (or scroll handler) on the track computes the
    active child and highlights the corresponding dot.
  - Dots are decorative position indicators (not the primary control — swipe is);
    give the dot row `aria-hidden` or expose slide count via `aria-label`. Keep a11y
    honest: the cards themselves remain real links and are keyboard/scroll reachable.
  - Respects `prefers-reduced-motion`.
- **RSC composition:** server-rendered card children are passed into this client
  component as `children` — allowed in the App Router.

### Changed
- `HeroFeature.tsx` — add the mobile stacked-overlay branch; keep desktop branch.
- `PostCard.tsx` — a mobile "big overlay poster" rendering for hero secondary
  (either a new `variant` or a responsive tweak to `overlay`); small overlaid title.
- `SectionBlock.tsx` — wrap the card row in `<Carousel>`.
- `LeadListBlock.tsx` — wrap posts in `<Carousel>` on mobile.
- `VideoSection.tsx` — wrap in `<Carousel>` with `dotColor="light"`.
- `styles.css` — any snap/dot helper classes not expressible inline (kept minimal;
  prefer Tailwind utilities).

---

## Testing

Playwright, mobile viewport (e.g. 390×844) and a desktop viewport:

- **Mobile hero:** renders N full-width stacked cards (one after another), each with
  an image and a small overlaid title; lead image present.
- **Mobile sections:** each section's track is horizontally scrollable and
  snap-enabled; a dot row is visible; scrolling/swiping advances the active dot.
- **Mobile video band:** dark band renders a carousel of video cards with play
  badges and light dots.
- **Desktop:** the hero grid, section 4-col grids, and video 2-col layout render as
  before (no carousel chrome; dots hidden).
- **Reduced motion:** smooth-scroll disabled under `prefers-reduced-motion`.

## Rollout / risk

- Additive and mobile-gated; desktop rendering is unchanged, low blast radius.
- Only new JS is the small `Carousel` client component (observer for dots). Keeps
  the site's no-heavy-JS posture and fast LCP (lead image stays `priority`).
- Known trade-off: 4 duplicated below-the-fold hero-secondary images on mobile
  (documented in §1).
