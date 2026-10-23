/**
 * Google Ad Manager inventory for Lalla Fatema — network 32994918 (Les éditions de la
 * gazette). Pure and framework-free so the registry and the size/viewport rules are
 * unit-tested in isolation; the browser runtime lives in `gpt.ts`, the slot component in
 * `components/GamSlot.tsx`.
 *
 * SOURCE: the network's tag sheet "Tags Google Ad Manager — Lalla Fatema" (30 units,
 * extraction of 06/10/2026). Unit codes and sizes are copied from it verbatim. The sheet
 * notes that the in-read unit's code is the bare number `35`; that is how this network
 * names its in-read units (Challenge.ma, same network, serves `/32994918/60` and `/61` the
 * same way), so it is kept as given.
 *
 * NAMING, as the network uses it on its other sites:
 *   - `_HP` = homepage, `_RG` = every other page; only Billboard and Habillage come in both.
 *   - `_PB`, `_PB_2` = the same format repeated lower down the page (Challenge.ma runs
 *     Billboard_HP at the top, Billboard_HP_PB below it, Billboard_PB_2 lower still).
 *   - `_AS` = all site; `M_` = phone-only units.
 *   - `Habillage` = the 1x1 site-skin (wallpaper) unit.
 *
 * VIEWPORTS mirror Tailwind's breakpoints exactly, so the CSS that hides a slot and the JS
 * that decides whether to request it can never disagree: phone < 48rem (md) <= tablet <
 * 64rem (lg) <= desktop. The sheet lists every size for every viewport; here each unit
 * only offers the sizes that physically fit — a 970 billboard is never requested on a
 * 900px tablet, and a 640x360 in-read never on a phone.
 */

export const GAM_NETWORK_CODE = '32994918'

export type Viewport = 'phone' | 'tablet' | 'desktop'
export const VIEWPORTS: readonly Viewport[] = ['phone', 'tablet', 'desktop']

/** Same thresholds as Tailwind's `md` and `lg`. */
export const VIEWPORT_QUERIES = {
  tablet: '(min-width: 48rem)',
  desktop: '(min-width: 64rem)',
} as const

export type AdSize = readonly [number, number]
type SizesByViewport = Partial<Record<Viewport, readonly AdSize[]>>

const BILLBOARD: SizesByViewport = {
  desktop: [
    [970, 250],
    [970, 90],
    [728, 90],
  ],
  tablet: [[728, 90]],
}
const BELOW_FOLD: SizesByViewport = {
  desktop: [
    [970, 90],
    [728, 90],
  ],
  tablet: [[728, 90]],
}
const LEADERBOARD: SizesByViewport = { desktop: [[728, 90]], tablet: [[728, 90]] }
const HALFPAGE: SizesByViewport = {
  desktop: [
    [300, 250],
    [300, 600],
  ],
  tablet: [
    [300, 250],
    [300, 600],
  ],
  phone: [
    [300, 250],
    [300, 600],
  ],
}
const SKIN: SizesByViewport = { desktop: [[1, 1]] }
const PHONE_320x50: SizesByViewport = { phone: [[320, 50]] }
const PHONE_320x100: SizesByViewport = { phone: [[320, 100]] }
const INREAD: SizesByViewport = {
  desktop: [
    [300, 250],
    [300, 600],
    [640, 360],
  ],
  tablet: [
    [300, 250],
    [300, 600],
    [640, 360],
  ],
  phone: [
    [300, 250],
    [300, 600],
  ],
}

type UnitSpec = { code: string; sizes: SizesByViewport }

const unit = (code: string, sizes: SizesByViewport): UnitSpec => ({ code, sizes })

/** All 30 units on the sheet, keyed by a short name (the code minus `LallaFatima_`). */
export const GAM_UNITS = {
  Inread: unit('35', INREAD),

  Billboard_HP: unit('LallaFatima_Billboard_HP', BILLBOARD),
  Billboard_HP_PB: unit('LallaFatima_Billboard_HP_PB', BILLBOARD),
  Billboard_HP_PB_2: unit('LallaFatima_Billboard_HP_PB_2', BILLBOARD),
  Billboard_RG: unit('LallaFatima_Billboard_RG', BILLBOARD),
  Billboard_RG_PB: unit('LallaFatima_Billboard_RG_PB', BILLBOARD),

  BTF_AS: unit('LallaFatima_BTF_AS', BELOW_FOLD),
  BTF_AS_PB: unit('LallaFatima_BTF_AS_PB', BELOW_FOLD),

  Habillage_HP: unit('LallaFatima_Habillage_HP', SKIN),
  Habillage_RG: unit('LallaFatima_Habillage_RG', SKIN),

  Halfpage_1: unit('LallaFatima_Halfpage_1', HALFPAGE),
  Halfpage_1_PB: unit('LallaFatima_Halfpage_1_PB', HALFPAGE),
  Halfpage_1_PB_2: unit('LallaFatima_Halfpage_1_PB_2', HALFPAGE),
  Halfpage_2: unit('LallaFatima_Halfpage_2', HALFPAGE),
  Halfpage_2_PB: unit('LallaFatima_Halfpage_2_PB', HALFPAGE),
  Halfpage_2_PB_2: unit('LallaFatima_Halfpage_2_PB_2', HALFPAGE),
  Halfpage_3: unit('LallaFatima_Halfpage_3', HALFPAGE),
  Halfpage_3_PB: unit('LallaFatima_Halfpage_3_PB', HALFPAGE),
  Halfpage_3_PB_2: unit('LallaFatima_Halfpage_3_PB_2', HALFPAGE),
  Halfpage_4: unit('LallaFatima_Halfpage_4', HALFPAGE),
  Halfpage_4_PB: unit('LallaFatima_Halfpage_4_PB', HALFPAGE),

  Header: unit('LallaFatima_Header', LEADERBOARD),
  Header_PB: unit('LallaFatima_Header_PB', LEADERBOARD),
  Header_PB_2: unit('LallaFatima_Header_PB_2', LEADERBOARD),

  M_320x100_MITOP_AS: unit('LallaFatima_M_320x100_MITOP_AS', PHONE_320x100),
  M_320x50_BTF_AS: unit('LallaFatima_M_320x50_BTF_AS', PHONE_320x50),
  M_320x50_BTF_AS_PB: unit('LallaFatima_M_320x50_BTF_AS_PB', PHONE_320x50),
  M_320x50_MITOP_AS: unit('LallaFatima_M_320x50_MITOP_AS', PHONE_320x50),
  M_320x50_MITOP_AS_PB: unit('LallaFatima_M_320x50_MITOP_AS_PB', PHONE_320x50),
  M_320x50_MITOP_AS_PB_2: unit('LallaFatima_M_320x50_MITOP_AS_PB_2', PHONE_320x50),
} as const satisfies Record<string, UnitSpec>

export type GamUnit = keyof typeof GAM_UNITS

/** Full GPT ad-unit path, e.g. `/32994918/LallaFatima_Header`. */
export function gamPath(name: GamUnit): string {
  return `/${GAM_NETWORK_CODE}/${GAM_UNITS[name].code}`
}

/** The slot's container id. One per unit, so a unit can appear at most once on a page. */
export function gamDivId(name: GamUnit): string {
  return `div-gpt-${GAM_UNITS[name].code}`
}

export function gamSizes(name: GamUnit, viewport: Viewport): readonly AdSize[] {
  return GAM_UNITS[name].sizes[viewport] ?? []
}

/** A 1x1 out-of-page unit: it carries a script (the skin), never a visible creative. */
export function isSkinUnit(name: GamUnit): boolean {
  return VIEWPORTS.every((v) => gamSizes(name, v).every(([w, h]) => w === 1 && h === 1))
}

/**
 * Viewports a placement actually shows on: the ones the caller allows (all by default)
 * that the unit also has a size for. Ordered phone → desktop.
 */
export function slotViewports(name: GamUnit, only?: readonly Viewport[]): Viewport[] {
  return VIEWPORTS.filter((v) => (!only || only.includes(v)) && gamSizes(name, v).length > 0)
}

/**
 * Height to reserve before the creative arrives, per viewport.
 *
 * `min` (the default) reserves the shortest size the slot can return; a taller creative
 * then grows the box. Below the fold that growth happens off-screen — slots are only
 * requested as they approach the viewport — so it costs no layout shift. `max` reserves
 * the tallest, for slots that are on screen at load (the top billboard) or that sit where
 * the extra height is free (the sticky sidebar).
 */
export function reserveHeight(
  name: GamUnit,
  viewport: Viewport,
  mode: 'min' | 'max' = 'min',
): number {
  const heights = gamSizes(name, viewport).map(([, h]) => h)
  if (heights.length === 0) return 0
  return mode === 'max' ? Math.max(...heights) : Math.min(...heights)
}

/**
 * Which viewport a browser width falls in, by the same thresholds as VIEWPORT_QUERIES.
 * Takes the two media-query results rather than reading `window`, so it is testable.
 */
export function viewportFrom(isTablet: boolean, isDesktop: boolean): Viewport {
  if (isDesktop) return 'desktop'
  if (isTablet) return 'tablet'
  return 'phone'
}
