'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { GalleryPhoto } from './GalleryPhoto'
import type { GalleryImage } from './types'

/**
 * Minimum horizontal travel, in CSS pixels, before a touch gesture counts as a swipe.
 * Below this a "swipe" is almost always the horizontal jitter of a tap or of a vertical
 * scroll, and advancing the photo on it makes the viewer feel like it is fighting the
 * reader. 40px is roughly a thumb's width of deliberate movement on a phone.
 */
const SWIPE_MIN_PX = 40

/**
 * Total travel above which a gesture was a DRAG, not a tap — so the synthetic `click` some
 * browsers fire at the end of it must not be read as "tap the backdrop to dismiss".
 * Without this, every swipe on a phone has a chance of closing the viewer instead of
 * changing the photo, which is the single most infuriating bug a touch gallery can have.
 */
const TAP_SLOP_PX = 10

/** Elements that can hold focus inside the dialog, for the focus trap. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Is the gesture/keyboard space mirrored? Read from the nearest `dir` attribute rather than
 * from a constant, because this component renders both on the RTL public site and inside the
 * admin's live preview, and a hard-coded `rtl` would invert the controls in any LTR context
 * (and in the gate specs, which render into a bare jsdom document).
 */
function isRtl(el: Element | null): boolean {
  const declared = el?.closest('[dir]')?.getAttribute('dir')
  if (declared) return declared.toLowerCase() === 'rtl'
  if (typeof document !== 'undefined') return document.documentElement.dir.toLowerCase() === 'rtl'
  return false
}

/** A chevron pointing toward the inline START of the line (right under RTL, left under LTR). */
function ChevronStart(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden className={`rtl:rotate-180 ${props.className ?? ''}`}>
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A chevron pointing toward the inline END of the line (left under RTL, right under LTR). */
function ChevronEnd(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden className={`rtl:rotate-180 ${props.className ?? ''}`}>
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

/**
 * Full-screen photo viewer for a gallery.
 *
 * DIRECTION IS DERIVED, NOT ASSUMED. This is an Arabic RTL magazine, so "the next photo"
 * lives to the LEFT of the current one: the forward control therefore sits at the inline
 * END (visually left) and ArrowLeft advances. Under LTR the same code puts forward on the
 * right and advances on ArrowRight. One mapping, mirrored once, so the key you press, the
 * button you see and the direction you swipe always agree — the failure mode this avoids is
 * the common one where the arrow keys keep LTR semantics while the buttons are mirrored,
 * and the two halves of the UI disagree about which way is forward.
 *
 * NAVIGATION WRAPS at both ends. A gallery is a ring, not a list: a reader who reaches the
 * last photo and presses forward again wants the first photo, not a dead key. Wrapping also
 * means there is no disabled state to communicate, which is one less thing to get wrong for
 * a keyboard or screen-reader user.
 *
 * Rendered through a portal on `document.body` so the overlay escapes the article's
 * `prose`/`overflow-hidden` ancestors; a fixed-position child of a transformed or clipped
 * parent is the classic way a "full screen" lightbox ends up clipped to a column.
 */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: GalleryImage[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  /** Set when the last gesture was a drag, so the trailing synthetic click is ignored. */
  const draggedRef = useRef(false)

  const count = images.length
  const current = images[index]

  /** Move `delta` photos, wrapping. The `+ count` keeps the modulo positive for -1. */
  const step = useCallback(
    (delta: number) => {
      if (count < 1) return
      onIndexChange((index + delta + count) % count)
    },
    [count, index, onIndexChange],
  )

  /**
   * One document-level keydown listener, torn down whenever the viewer closes or the
   * handler identity changes. It lives on `document` rather than on the dialog because the
   * reader may not have moved focus into the dialog yet (a click leaves focus on the tile
   * until our focus effect lands), and Escape must work from the very first frame.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const rtl = isRtl(dialogRef.current)

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          return
        case 'ArrowRight':
          event.preventDefault()
          step(rtl ? -1 : 1)
          return
        case 'ArrowLeft':
          event.preventDefault()
          step(rtl ? 1 : -1)
          return
        case 'Home':
          event.preventDefault()
          onIndexChange(0)
          return
        case 'End':
          event.preventDefault()
          onIndexChange(Math.max(0, count - 1))
          return
        case 'Tab': {
          // Focus trap. A modal that lets Tab walk out into the page behind it is not a
          // modal: a screen-reader or keyboard user ends up operating an article they
          // cannot see, with no way to tell that they have left the dialog.
          const root = dialogRef.current
          if (!root) return
          const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
          )
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          const active = document.activeElement as HTMLElement | null
          if (event.shiftKey && (active === first || !root.contains(active))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && active === last) {
            event.preventDefault()
            first.focus()
          }
          return
        }
        default:
          return
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [count, onClose, onIndexChange, step])

  /**
   * Lock the page behind the overlay. Without this, a touch scroll that starts on the
   * backdrop scrolls the article underneath, so closing the viewer drops the reader
   * somewhere they never chose to be. The previous inline value is restored rather than
   * cleared, so we never clobber a lock some other component set.
   */
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  /** Move focus into the dialog on open, so the next Tab stays inside the trap. */
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    draggedRef.current = false
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) draggedRef.current = true

    // A mostly-vertical drag is a scroll attempt, not a swipe. Comparing the two axes
    // (rather than only thresholding dx) is what stops a reader who flicks down the page
    // from landing on a different photo than the one they were looking at.
    if (Math.abs(dx) <= Math.abs(dy)) return
    if (Math.abs(dx) < SWIPE_MIN_PX) return

    // Content follows the finger: dragging the photo away toward the inline start pulls the
    // next one in. Under RTL the next photo is to the left, so that is a rightward drag.
    const rtl = isRtl(dialogRef.current)
    step(rtl ? (dx > 0 ? 1 : -1) : dx < 0 ? 1 : -1)
  }

  /**
   * Tap-anywhere-to-dismiss, which is what readers expect from a full-screen photo overlay
   * — but ONLY for a real tap. `draggedRef` is what stops the click some browsers synthesise
   * at the end of a swipe from closing the viewer the reader was navigating.
   */
  const onBackdropClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    onClose()
  }

  if (typeof document === 'undefined' || !current) return null

  const caption = typeof current.caption === 'string' && current.caption.trim() ? current.caption : null
  const credit = current.image && typeof current.image === 'object' ? current.image.credit : null

  return createPortal(
    <div
      ref={dialogRef}
      data-testid="lf-lightbox"
      data-index={String(index)}
      role="dialog"
      aria-modal="true"
      aria-label={`معرض الصور — صورة ${index + 1} من ${count}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
    >
      {/* Backdrop. aria-hidden and not focusable: the dialog already offers a real labelled
          close button and Escape, so exposing this to AT would add a third, unlabelled way
          to do the same thing. It covers the whole dialog and the photo region above it is
          `pointer-events-none`, so a tap on the photo lands here — the gesture guard in
          `onBackdropClick` is what keeps that from eating a swipe. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onBackdropClick}
        className="absolute inset-0 cursor-default"
      />

      {/* Announces navigation to assistive tech. The visible counter is aria-hidden, and a
          `role="dialog"` label is not reliably re-read when only its text changes, so
          without this a screen-reader user pressing the arrow keys gets the new photo's alt
          text but never learns where they are in the set. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {`صورة ${index + 1} من ${count}`}
      </p>

      <div className="relative flex items-center justify-between gap-2 px-3 py-2">
        <span aria-hidden className="text-sm font-bold tabular-nums text-white/80">
          {index + 1} / {count}
        </span>
        <button
          ref={closeRef}
          type="button"
          data-testid="lf-lightbox-close"
          onClick={onClose}
          aria-label="إغلاق معرض الصور"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <CloseGlyph />
        </button>
      </div>

      {/* min-h-0 lets this flex child actually shrink, which is what keeps the photo inside
          the viewport instead of pushing the caption off the bottom on a short screen. */}
      <div className="relative min-h-0 flex-1">
        {/* `key` forces a fresh <img> per photo: without it React reuses the element and the
            browser paints the previous photo until the new one decodes. */}
        <GalleryPhoto
          key={index}
          item={current}
          sizes="100vw"
          fit="contain"
          priority
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="الصورة السابقة"
              className="absolute inset-y-0 start-0 grid w-14 place-items-center text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-20"
            >
              <ChevronStart />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="الصورة التالية"
              className="absolute inset-y-0 end-0 grid w-14 place-items-center text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-20"
            >
              <ChevronEnd />
            </button>
          </>
        )}
      </div>

      {(caption || credit) && (
        <div className="relative mx-auto w-full max-w-3xl px-4 py-3 text-center">
          {caption && <p className="text-sm leading-relaxed text-white/90">{caption}</p>}
          {credit && <p className="mt-1 text-xs text-white/60">{credit}</p>}
        </div>
      )}
    </div>,
    document.body,
  )
}
