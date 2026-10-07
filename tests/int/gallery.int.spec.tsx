import React from 'react'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'

import { Gallery } from '@/components/gallery/Gallery'
import type { GalleryImage } from '@/components/gallery/types'

/**
 * Behaviour this suite covers that the driver gate specs deliberately do not: the RTL
 * mirroring of every navigation gesture, the mosaic's geometry decisions, which `alt` wins,
 * and the focus/scroll bookkeeping that makes the lightbox a real modal rather than a
 * fixed-position div. Those are the parts most likely to rot silently — nothing visibly
 * breaks when a focus restore stops working.
 */

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('dir')
  document.body.style.removeProperty('overflow')
})

const photo = (n: number, overrides: Partial<GalleryImage> = {}): GalleryImage => ({
  image: {
    id: n,
    url: `/media/photo-${n}.jpg`,
    alt: `وصف المكتبة ${n}`,
    width: 1200,
    height: 800,
    filename: `photo-${n}.jpg`,
    mimeType: 'image/jpeg',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  caption: `تعليق ${n}`,
  alt: null,
  ...overrides,
})

const many = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1))

const tiles = () => screen.getAllByTestId('lf-gallery-tile')
const openTile = (i = 0) => fireEvent.click(tiles()[i].querySelector('button') as HTMLButtonElement)
const index = () => screen.getByTestId('lf-lightbox').getAttribute('data-index')

const swipe = (dx: number, dy = 4) => {
  const box = screen.getByTestId('lf-lightbox')
  fireEvent.touchStart(box, { touches: [{ clientX: 300, clientY: 300 }] })
  fireEvent.touchEnd(box, { changedTouches: [{ clientX: 300 + dx, clientY: 300 + dy }] })
}

describe('Gallery alt text', () => {
  it('prefers the per-photo alt an editor typed in THIS article over the media library default', () => {
    render(<Gallery layout="grid" images={[photo(1, { alt: 'الفنانة على السجادة الحمراء' })]} />)
    expect(screen.getByAltText('الفنانة على السجادة الحمراء')).toBeTruthy()
    expect(screen.queryByAltText('وصف المكتبة 1')).toBeNull()
  })

  it('falls back to the media library alt when the block has no override', () => {
    render(<Gallery layout="grid" images={[photo(1)]} />)
    expect(screen.getByAltText('وصف المكتبة 1')).toBeTruthy()
  })

  it('leaves a wholly undescribed photo decorative rather than inventing a label', () => {
    const undescribed = photo(1, { alt: '   ' })
    undescribed.image = { ...(undescribed.image as object), alt: '' } as GalleryImage['image']
    render(<Gallery layout="grid" images={[undescribed]} />)
    const img = document.querySelector('img')
    expect(img?.getAttribute('alt')).toBe('')
  })
})

describe('Mosaic geometry', () => {
  it('gives three photos a 2x2 hero so the grid comes out a full rectangle', () => {
    render(<Gallery layout="mosaic" images={many(3)} />)
    expect(tiles()[0].className).toContain('col-span-2')
    expect(tiles()[1].className).not.toContain('col-span-2')
  })

  it('drops the hero at four photos, where it would leave an empty cell', () => {
    render(<Gallery layout="mosaic" images={many(4)} />)
    for (const tile of tiles()) expect(tile.className).not.toContain('col-span-2')
  })

  it('restores the hero once the four thumbnail cells are filled', () => {
    render(<Gallery layout="mosaic" images={many(5)} />)
    expect(tiles()[0].className).toContain('col-span-2')
  })

  it('states the hidden count in the overflow tile accessible name, not only as "+N"', () => {
    render(<Gallery layout="mosaic" images={many(9)} />)
    const button = tiles()[4].querySelector('button')
    expect(button?.getAttribute('aria-label')).toContain('4')
    // The veil itself stays exactly "+4" so the glanceable number is unambiguous.
    expect(within(screen.getByTestId('lf-gallery-overflow')).getByText('+4')).toBeTruthy()
  })

  it('never shows a counter on grid or carousel, however many photos there are', () => {
    render(<Gallery layout="grid" images={many(30)} />)
    expect(screen.queryByTestId('lf-gallery-overflow')).toBeNull()
    expect(tiles()).toHaveLength(30)
  })
})

describe('Gallery survives an unpopulated relation', () => {
  /**
   * A gallery read back at depth 0 hands us bare relation ids. The photos cannot be shown,
   * but the TILE COUNT must survive — otherwise a 9-photo mosaic silently renders 0 tiles
   * and the "+N" arithmetic reports a number that matches nothing on screen.
   */
  it('still renders one tile per row and the right +N when photos came back as ids', () => {
    const ids: GalleryImage[] = Array.from({ length: 9 }, (_, i) => ({
      image: i + 1,
      caption: null,
      alt: `بديل ${i + 1}`,
    }))
    render(<Gallery layout="mosaic" images={ids} />)
    expect(tiles()).toHaveLength(5)
    expect(within(screen.getByTestId('lf-gallery-overflow')).getByText('+4')).toBeTruthy()
  })

  it('renders the branded placeholder rather than a broken image', () => {
    render(<Gallery layout="grid" images={[{ image: null, caption: null, alt: 'بديل' }]} />)
    expect(screen.getByRole('img', { name: 'بديل' })).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('Lightbox direction is mirrored under RTL', () => {
  /**
   * This is the whole reason the handler reads `dir` instead of hard-coding a direction.
   * On the live site (`<html dir="rtl">`) the next photo is to the LEFT, so ArrowLeft must
   * advance — and the on-screen forward control sits at the inline end, which is the same
   * side. Keys, buttons and swipe all agree, in both directions.
   */
  it('advances on ArrowLeft and goes back on ArrowRight when the document is RTL', () => {
    document.documentElement.dir = 'rtl'
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    expect(index()).toBe('0')
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(index()).toBe('1')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(index()).toBe('0')
  })

  it('keeps LTR semantics when no direction is declared', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(index()).toBe('1')
  })

  it('advances on a rightward swipe under RTL and a leftward swipe under LTR', () => {
    document.documentElement.dir = 'rtl'
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    swipe(220)
    expect(index()).toBe('1')
    cleanup()

    document.documentElement.removeAttribute('dir')
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    swipe(-220)
    expect(index()).toBe('1')
  })

  it('ignores a flick too short to be deliberate, in either direction', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    swipe(-20)
    expect(index()).toBe('0')
    swipe(20)
    expect(index()).toBe('0')
  })
})

describe('Lightbox is a real modal', () => {
  it('opens on the tile that was clicked, not always on the first photo', () => {
    render(<Gallery layout="grid" images={many(4)} />)
    openTile(2)
    expect(index()).toBe('2')
  })

  it('is labelled and reports its position in the set', () => {
    render(<Gallery layout="grid" images={many(4)} />)
    openTile(1)
    const label = screen.getByTestId('lf-lightbox').getAttribute('aria-label') ?? ''
    expect(label).toContain('2')
    expect(label).toContain('4')
  })

  it('moves focus to the close control so the next Tab stays inside the dialog', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    expect(document.activeElement).toBe(screen.getByTestId('lf-lightbox-close'))
  })

  it('wraps Tab back into the dialog instead of letting focus walk into the article', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    const dialog = screen.getByTestId('lf-lightbox')
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button')).filter(
      (el) => el.getAttribute('aria-hidden') !== 'true',
    )
    const last = focusable[focusable.length - 1]
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('locks the page behind it and releases the lock on close', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByTestId('lf-lightbox-close'))
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('jumps to the first and last photo with Home and End', () => {
    render(<Gallery layout="grid" images={many(6)} />)
    openTile(2)
    fireEvent.keyDown(document, { key: 'End' })
    expect(index()).toBe('5')
    fireEvent.keyDown(document, { key: 'Home' })
    expect(index()).toBe('0')
  })

  it('shows every photo, including the ones the mosaic hid behind "+N"', () => {
    render(<Gallery layout="mosaic" images={many(9)} />)
    openTile(4)
    // The viewer is a window on the FULL set, not on the five visible tiles: the reader
    // clicked "+4" precisely to reach the photos that were not rendered.
    const label = screen.getByTestId('lf-lightbox').getAttribute('aria-label') ?? ''
    expect(label).toContain('9')
    fireEvent.keyDown(document, { key: 'End' })
    expect(index()).toBe('8')
  })

  it('offers no prev/next controls for a single photo', () => {
    render(<Gallery layout="grid" images={many(1)} />)
    openTile()
    expect(screen.queryByLabelText('الصورة التالية')).toBeNull()
    expect(screen.queryByLabelText('الصورة السابقة')).toBeNull()
  })

  it('navigates with the on-screen controls as well as the keyboard', () => {
    render(<Gallery layout="grid" images={many(3)} />)
    openTile()
    fireEvent.click(screen.getByLabelText('الصورة التالية'))
    expect(index()).toBe('1')
    fireEvent.click(screen.getByLabelText('الصورة السابقة'))
    expect(index()).toBe('0')
  })
})
