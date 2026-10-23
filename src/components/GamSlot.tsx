'use client'

import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import {
  VIEWPORT_QUERIES,
  gamDivId,
  gamPath,
  gamSizes,
  isSkinUnit,
  reserveHeight,
  slotViewports,
  viewportFrom,
  type GamUnit,
  type Viewport,
} from '@/lib/gam'
import { requestSlot } from '@/lib/gpt'

const GamEnabled = createContext(false)

/**
 * Turns Ad Manager on for everything below it. The layout passes Site Settings ›
 * `adsEnabled`, the same master switch that pauses the dashboard-managed ads, so one
 * checkbox stops every ad on the site. The editor-only draft preview never shows ads.
 */
export function GamProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname()
  return (
    <GamEnabled.Provider value={enabled && !pathname.startsWith('/preview')}>
      {children}
    </GamEnabled.Provider>
  )
}

/**
 * Display per viewport combination. Literal strings so Tailwind generates every one; a
 * slot is hidden by CSS on the viewports it does not serve, before any script runs.
 */
const SHOW_ON: Record<string, string> = {
  phone: 'flex md:hidden',
  tablet: 'hidden md:flex lg:hidden',
  desktop: 'hidden lg:flex',
  'phone,tablet': 'flex lg:hidden',
  'tablet,desktop': 'hidden md:flex',
  'phone,desktop': 'flex md:hidden lg:flex',
  'phone,tablet,desktop': 'flex',
}

/** Load a slot once its container is within this distance of the viewport. */
const LAZY_MARGIN = '150% 0px'

function currentViewport(): Viewport {
  return viewportFrom(
    window.matchMedia(VIEWPORT_QUERIES.tablet).matches,
    window.matchMedia(VIEWPORT_QUERIES.desktop).matches,
  )
}

/**
 * One Ad Manager position. Renders a container that reserves the slot's height per
 * viewport in CSS (so the server HTML is already the right size — no layout shift), and
 * requests the ad only when the container nears the viewport, and only on the viewports
 * the slot serves (`only` narrows them further — e.g. a sidebar slot that must not fall
 * back to the phone layout). Renders nothing when ads are off.
 *
 * Each unit can appear once per page: its container id is derived from the unit. To show
 * one unit in two places on different viewports (sidebar on desktop, inline on a phone),
 * render it twice with disjoint `only` lists — at most one of them requests.
 *
 * THE ID IS SET HERE, NOT IN THE MARKUP. Both copies of such a unit are in the server
 * HTML, and GPT renders into `getElementById(divId)` — the FIRST copy in the document. With
 * the id in the markup, the desktop rail requested the ad and GPT painted it into the
 * hidden phone copy above it: a filled, billed, invisible impression. So only the copy
 * that actually requests on this viewport ever carries the id.
 */
export function GamSlot({
  unit,
  only,
  reserve = 'min',
  className = '',
}: {
  unit: GamUnit
  only?: readonly Viewport[]
  reserve?: 'min' | 'max'
  className?: string
}) {
  const enabled = useContext(GamEnabled)
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLDivElement>(null)

  const viewports = slotViewports(unit, only)
  const viewportsKey = viewports.join(',')
  const skin = isSkinUnit(unit)
  const divId = gamDivId(unit)

  useEffect(() => {
    const host = ref.current
    const container = target.current
    if (!enabled || !host || !container) return
    const viewport = currentViewport()
    if (!viewportsKey.split(',').includes(viewport)) return
    container.id = divId

    let release: (() => void) | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        release = requestSlot({
          path: gamPath(unit),
          divId,
          sizes: gamSizes(unit, viewport),
          skin,
        })
      },
      { rootMargin: LAZY_MARGIN },
    )
    observer.observe(host)

    return () => {
      observer.disconnect()
      release?.()
      container.removeAttribute('id')
      delete host.dataset.adState
    }
    // `pathname`: a client navigation is a new page view, so the slot is re-requested
    // even when the same component instance stays mounted (article → article).
  }, [enabled, unit, divId, skin, viewportsKey, pathname])

  if (!enabled || viewports.length === 0) return null

  if (skin) {
    // Out of flow: the 1x1 frame only carries the skin's script.
    return (
      <div
        ref={ref}
        data-ad-unit={unit}
        data-ad-skin=""
        className={`pointer-events-none absolute top-0 h-px w-px overflow-hidden ${SHOW_ON[viewportsKey]}`}
      >
        <div key={pathname} ref={target} />
      </div>
    )
  }

  const style: Record<string, string> = {}
  for (const v of viewports) style[`--lf-ad-${v}`] = `${reserveHeight(unit, v, reserve)}px`

  return (
    <div
      ref={ref}
      data-ad-unit={unit}
      className={`lf-ad items-center justify-center overflow-hidden ${SHOW_ON[viewportsKey]} ${className}`}
      style={style as CSSProperties}
    >
      {/* Keyed by page so a navigation hands GPT a fresh, empty container. */}
      <div key={pathname} ref={target} />
    </div>
  )
}
