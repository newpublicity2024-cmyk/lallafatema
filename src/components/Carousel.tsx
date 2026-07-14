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
        className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 md:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:gap-6 md:overflow-visible ${trackClassName}`}
      >
        {items.map((child, i) => (
          <div key={i} className={`shrink-0 snap-center ${slideClassName} md:basis-auto md:contents`}>
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
