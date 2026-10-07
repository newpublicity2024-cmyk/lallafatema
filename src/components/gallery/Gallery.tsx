'use client'

import { useCallback, useRef, useState } from 'react'

import { GalleryPhoto, photoAlt } from './GalleryPhoto'
import { Lightbox } from './Lightbox'
import type { GalleryImage, GalleryLayout } from './types'

/**
 * How many tiles a mosaic shows before it starts counting.
 *
 * Five is not arbitrary: the mosaic is a 4x2 grid whose first tile spans 2x2, which leaves
 * exactly four 1x1 cells — a hero plus four thumbnails, with no ragged last row. Any other
 * cap would leave a hole in the grid, so the cap and the layout are one decision.
 */
export const MOSAIC_TILE_CAP = 5

/**
 * Column counts per photo count, for the mosaic only.
 *
 * Written out rather than computed because Tailwind scans source text for class names: a
 * template string like `grid-cols-${n}` produces no CSS at all. Each entry is also chosen so
 * the grid comes out as a complete rectangle (see MOSAIC_TILE_CAP) — 3 photos fill a 3x2
 * with the hero spanning 2x2, 4 photos read better as an even 2x2 with no hero, and 5+ fill
 * a 4x2. On phones everything collapses to two columns, where a 4-wide mosaic would render
 * thumbnails too small to be worth the bytes.
 */
const MOSAIC_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2',
  5: 'grid-cols-2 sm:grid-cols-4',
}

/** Row height drives mosaic tile size; a hero spans two rows, so it is twice this tall. */
const MOSAIC_ROWS = 'auto-rows-[6.5rem] sm:auto-rows-[9rem] lg:auto-rows-[11rem]'

/**
 * A hero tile only earns its place when the remaining photos fill the cells beside it.
 * At four photos a hero would leave an empty cell, so four renders as an even 2x2.
 */
function hasHeroTile(visibleCount: number): boolean {
  return visibleCount === 3 || visibleCount >= MOSAIC_TILE_CAP
}

/**
 * `sizes` per layout, so the browser downloads a thumbnail for a thumbnail. Getting this
 * wrong is the most expensive mistake available in a photo grid: without it Next assumes
 * 100vw and a nine-photo grid pulls nine full-width images onto a phone.
 */
const TILE_SIZES: Record<GalleryLayout, string> = {
  mosaic: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px',
  grid: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  carousel: '(max-width: 640px) 80vw, (max-width: 1024px) 48vw, 32vw',
}

/** The scrolling/grid container, per layout. */
function containerClassFor(layout: GalleryLayout, visibleCount: number): string {
  if (layout === 'mosaic') {
    const columns = MOSAIC_COLUMNS[Math.min(Math.max(visibleCount, 1), MOSAIC_TILE_CAP)]
    return `grid gap-1.5 sm:gap-2 ${columns} ${MOSAIC_ROWS}`
  }
  if (layout === 'grid') {
    return 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4'
  }
  // Carousel: a scroll-snap track. `overflow-x-auto` scopes the overflow to the TRACK, so a
  // twenty-photo carousel never makes the page scroll sideways at 375px. Direction needs no
  // special handling: the track inherits `dir="rtl"` from the document, so the browser
  // starts it at the right edge and scrolls leftward by itself.
  return 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
}

/** The photo box inside a tile — it is what reserves the aspect ratio, so CLS stays zero. */
function photoBoxClassFor(layout: GalleryLayout): string {
  if (layout === 'mosaic') return 'h-full w-full'
  if (layout === 'carousel') return 'aspect-[4/3] w-full'
  return 'aspect-square w-full'
}

/**
 * The public gallery block: three layouts over one set of photos, all opening the same
 * lightbox.
 *
 * WHY A <figure> WRAPPING A PHOTO BOX AND AN OVERLAY <button>, rather than a clickable div
 * or a button wrapping everything: the tile has to be three things at once — an image with
 * an optionally associated caption (only figure/figcaption associates them), a real
 * activation target (so Enter/Space, the focus ring and the AT announcement all come for
 * free), and valid markup. A <button> may only contain phrasing content, so it can hold
 * neither a <figcaption> nor `PostImage`'s `<div role="img">` placeholder. Stretching the
 * button over the photo as an overlay satisfies all three at once — the same shape
 * `VideoPlayer` already uses for its play affordance.
 *
 * WHY STATE LIVES HERE and not inside the lightbox: the gallery is what knows which tile was
 * clicked and which element focus must return to on close. Keeping the index here also makes
 * the lightbox a pure view of `(images, index)`, which is what makes its `data-index`
 * trustworthy rather than a second source of truth.
 */
export function Gallery({
  layout,
  images,
}: {
  layout: GalleryLayout
  images: GalleryImage[]
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  /**
   * The tile that opened the viewer. Returning focus there on close is what keeps keyboard
   * navigation coherent — otherwise focus falls back to <body> and the reader's next Tab
   * restarts from the top of the article.
   */
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => {
    setOpenIndex(null)
    const target = returnFocusRef.current
    // Restored after the portal unmounts; doing it in the same tick would race the
    // lightbox's own focus effect when a reader re-opens straight away.
    if (target) requestAnimationFrame(() => target.focus())
  }, [])

  const items = Array.isArray(images) ? images : []
  if (items.length === 0) return null

  const capped = layout === 'mosaic' && items.length > MOSAIC_TILE_CAP
  const visible = capped ? items.slice(0, MOSAIC_TILE_CAP) : items
  // Counted from the data, never a hard-coded string: the tile states exactly how many
  // photos the reader has not seen yet.
  const remaining = items.length - visible.length
  const hero = layout === 'mosaic' && hasHeroTile(visible.length)
  const photoBox = photoBoxClassFor(layout)

  return (
    <>
      <div
        data-testid="lf-gallery"
        data-layout={layout}
        // role=group + a label: a bare div of buttons is announced as a pile of unrelated
        // controls, which leaves a screen-reader user no way to tell the photos belong
        // together, or how many there are behind the "+N" tile.
        role="group"
        aria-label={`معرض صور — ${items.length} صورة`}
        className={`my-6 w-full ${containerClassFor(layout, visible.length)}`}
      >
        {visible.map((item, i) => {
          const isOverflowTile = capped && i === visible.length - 1
          const isHero = hero && i === 0
          const caption = typeof item.caption === 'string' && item.caption.trim() ? item.caption : null
          const label = photoAlt(item) || caption || `صورة ${i + 1}`

          return (
            <figure
              key={i}
              data-testid="lf-gallery-tile"
              className={
                layout === 'mosaic'
                  ? `m-0 ${isHero ? 'col-span-2 row-span-2' : ''}`
                  : layout === 'carousel'
                    ? 'm-0 w-[80%] shrink-0 snap-center sm:w-[48%] lg:w-[32%]'
                    : 'm-0'
              }
            >
              <div className={`group relative overflow-hidden rounded-lg bg-brand-100 ${photoBox}`}>
                <GalleryPhoto item={item} sizes={TILE_SIZES[layout]} />

                {/* Mosaic tiles carry the caption as an overlay: the grid row sets the
                    tile's height, so a block caption underneath would spill out of the cell
                    and break the rectangle. Grid and carousel tiles get a real
                    <figcaption> below the photo instead. */}
                {layout === 'mosaic' && caption && !isOverflowTile && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-start text-xs leading-snug text-white"
                  >
                    <span className="line-clamp-2">{caption}</span>
                  </span>
                )}

                {/* The "+N" veil. Its text content is EXACTLY "+N" — the readable
                    explanation lives in the button's aria-label — so the counter stays one
                    unambiguous glanceable number for sighted readers and is not read out
                    twice to everyone else. */}
                {isOverflowTile && remaining > 0 && (
                  <span
                    data-testid="lf-gallery-overflow"
                    aria-hidden
                    className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-2xl font-extrabold text-white transition-colors group-hover:bg-black/70 sm:text-3xl"
                  >
                    {`+${remaining}`}
                  </span>
                )}

                <button
                  type="button"
                  onClick={(event) => {
                    returnFocusRef.current = event.currentTarget
                    setOpenIndex(i)
                  }}
                  aria-haspopup="dialog"
                  aria-label={
                    isOverflowTile && remaining > 0
                      ? `${label} — وعرض ${remaining} صورة أخرى`
                      : `تكبير الصورة: ${label}`
                  }
                  className="absolute inset-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
                />
              </div>

              {layout !== 'mosaic' && caption && (
                <figcaption className="mt-1.5 text-xs leading-snug text-brand-700 sm:text-sm">
                  {caption}
                </figcaption>
              )}
            </figure>
          )
        })}
      </div>

      {openIndex !== null && (
        <Lightbox images={items} index={openIndex} onIndexChange={setOpenIndex} onClose={close} />
      )}
    </>
  )
}
