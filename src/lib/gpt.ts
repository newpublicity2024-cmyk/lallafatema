/**
 * Google Publisher Tag (GPT) runtime for a client-navigated site. Browser-only: imported
 * by `components/GamSlot.tsx`, never by a server component.
 *
 * WHY NOT THE SHEET'S SNIPPET. The tag sheet's example defines all 30 slots in <head> and
 * lets the first `display()` fetch them. That is written for a site that reloads on every
 * click. Here the layout persists across navigations, so a slot must be defined when its
 * container mounts, destroyed when it unmounts, and re-requested for the next page — with
 * a fresh correlator, or Ad Manager counts every page of the visit as one page view and
 * roadblocks / competitive exclusions leak across pages.
 *
 * SHAPE.
 *   - Single Request Architecture (the sheet's `enableSingleRequest`) with the initial
 *     load disabled: `display()` only registers a slot, `refresh()` fetches. Every slot
 *     that becomes due in the same task is fetched in ONE request, so the skin and the top
 *     billboard always travel together and a roadblock can serve.
 *   - Lazy: `GamSlot` only calls `requestSlot` once its container nears the viewport, so a
 *     slot far down the page costs nothing until the reader scrolls toward it. (GPT's own
 *     lazy-load cannot do this here: under SRA it only fetches lazily when EVERY slot is
 *     outside the margin, and the top billboard never is.)
 *   - The script is injected on first use, after hydration — off the critical path.
 *
 * CONSENT. Before each request the reader's `lf-consent` choice is applied: no advertising
 * consent (including "not chosen yet") requests non-personalised ads, which still serve.
 * This mirrors the Consent Mode `ad_storage` default the site already sets for gtag.
 */
import { readConsentCookie } from './consent'

export const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'

/** Class put on <html> while a skin creative is on the page; see styles.css. */
export const SKINNED_CLASS = 'lf-skinned'

/** The subset of the GPT API this module uses. */
type Slot = {
  addService(service: PubAds): Slot
  getSlotElementId(): string
}
type SlotRenderEndedEvent = { slot: Slot; isEmpty: boolean }
type PubAds = {
  enableSingleRequest(): boolean
  disableInitialLoad(): void
  refresh(slots?: Slot[], options?: { changeCorrelator: boolean }): void
  setPrivacySettings(settings: { nonPersonalizedAds?: boolean }): PubAds
  addEventListener(type: 'slotRenderEnded', listener: (event: SlotRenderEndedEvent) => void): PubAds
  getSlots(): Slot[]
}
type GoogleTag = {
  cmd: Array<() => void> | { push(fn: () => void): number }
  pubads(): PubAds
  defineSlot(path: string, sizes: readonly (readonly [number, number])[], divId: string): Slot | null
  display(divId: string): void
  destroySlots(slots?: Slot[]): boolean
  enableServices(): void
}

declare global {
  interface Window {
    googletag?: GoogleTag
  }
}

/**
 * How long a requested slot may wait for its render event before its reserved space is
 * collapsed. Ad blockers either stop gpt.js outright (handled on the script's `error`) or
 * replace it with a stub that never renders — without this, every reserved box would stay
 * on the page as a blank hole. A slot that renders later still reappears.
 */
const RENDER_TIMEOUT_MS = 8000

let started = false
/** gpt.js failed to load: nothing will ever render, so slots collapse at once. */
let blocked = false
let pending: Slot[] = []
let flushScheduled = false
/** Path of the last page that requested ads; a change means a new page view. */
let lastPage: string | null = null

function gt(): GoogleTag {
  window.googletag = window.googletag || ({ cmd: [] } as unknown as GoogleTag)
  return window.googletag
}

/** Queue work for when GPT is ready (runs immediately once it is). */
function whenReady(fn: () => void) {
  gt().cmd.push(fn)
}

function start() {
  if (started) return
  started = true

  whenReady(() => {
    const g = gt()
    const pubads = g.pubads()
    pubads.enableSingleRequest()
    pubads.disableInitialLoad()
    pubads.addEventListener('slotRenderEnded', onRenderEnded)
    g.enableServices()
  })

  if (!document.querySelector(`script[src="${GPT_SRC}"]`)) {
    const script = document.createElement('script')
    script.src = GPT_SRC
    script.async = true
    script.crossOrigin = 'anonymous'
    script.addEventListener('error', () => {
      blocked = true
      document
        .querySelectorAll<HTMLElement>('[data-ad-unit]:not([data-ad-state])')
        .forEach((host) => (host.dataset.adState = 'empty'))
    })
    document.head.appendChild(script)
  }
}

function hostOf(divId: string): HTMLElement | null {
  return document.getElementById(divId)?.closest<HTMLElement>('[data-ad-unit]') ?? null
}

/** Collapse a slot that has not rendered (yet); a later render event re-shows it. */
function collapseIfUnrendered(divId: string) {
  const host = hostOf(divId)
  if (host && !host.dataset.adState) host.dataset.adState = 'empty'
}

/**
 * Marks the slot's container filled or empty. An empty container collapses (styles.css),
 * so an unsold position leaves no hole in the page.
 */
function onRenderEnded(event: SlotRenderEndedEvent) {
  const host = hostOf(event.slot.getSlotElementId())
  if (!host) return
  host.dataset.adState = event.isEmpty ? 'empty' : 'filled'
  if (!event.isEmpty && host.dataset.adSkin !== undefined) {
    document.documentElement.classList.add(SKINNED_CLASS)
  }
}

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  // A macrotask, so every slot defined in the current task — all the containers that
  // entered the viewport together — joins this one request.
  setTimeout(() => {
    flushScheduled = false
    whenReady(() => {
      const slots = pending
      pending = []
      if (slots.length === 0) return
      const page = location.pathname
      const changeCorrelator = lastPage !== null && lastPage !== page
      lastPage = page
      const pubads = gt().pubads()
      pubads.setPrivacySettings({ nonPersonalizedAds: readConsentCookie()?.ads !== true })
      pubads.refresh(slots, { changeCorrelator })
    })
  }, 0)
}

type SlotRequest = {
  path: string
  divId: string
  sizes: readonly (readonly [number, number])[]
  /** A skin unit: its creative restyles <body>, which is restored on release. */
  skin?: boolean
}

/**
 * Defines, registers and (in the next batch) fetches one slot. Returns the release
 * function, which destroys the slot — call it when the container unmounts or the page
 * changes.
 */
export function requestSlot({ path, divId, sizes, skin = false }: SlotRequest): () => void {
  start()
  if (blocked) {
    collapseIfUnrendered(divId)
    return () => {}
  }
  const watchdog = setTimeout(() => collapseIfUnrendered(divId), RENDER_TIMEOUT_MS)

  let slot: Slot | null = null
  let released = false
  // Skin creatives write inline styles straight onto <html>/<body>. Snapshot them now, so
  // leaving the page cannot carry one advertiser's wallpaper onto the next page.
  const before = skin
    ? {
        html: document.documentElement.getAttribute('style'),
        body: document.body.getAttribute('style'),
      }
    : null

  whenReady(() => {
    if (released) return
    const g = gt()
    // A container hosts one slot. A definition left behind by a fast remount is cleared
    // first, or defineSlot refuses the div and returns null.
    const stale = g.pubads().getSlots().filter((s) => s.getSlotElementId() === divId)
    if (stale.length) g.destroySlots(stale)

    slot = g.defineSlot(path, sizes, divId)
    if (!slot) return
    slot.addService(g.pubads())
    g.display(divId) // registers only: the initial load is disabled
    pending.push(slot)
    scheduleFlush()
  })

  return () => {
    released = true
    clearTimeout(watchdog)
    whenReady(() => {
      if (!slot) return
      pending = pending.filter((s) => s !== slot)
      gt().destroySlots([slot])
      slot = null
    })
    if (before) {
      document.documentElement.classList.remove(SKINNED_CLASS)
      restoreStyle(document.documentElement, before.html)
      restoreStyle(document.body, before.body)
    }
  }
}

function restoreStyle(el: HTMLElement, value: string | null) {
  if (value === null) el.removeAttribute('style')
  else el.setAttribute('style', value)
}
