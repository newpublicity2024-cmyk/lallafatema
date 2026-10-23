import { describe, it, expect } from 'vitest'

import {
  GAM_NETWORK_CODE,
  GAM_UNITS,
  VIEWPORTS,
  gamDivId,
  gamPath,
  gamSizes,
  isSkinUnit,
  reserveHeight,
  slotViewports,
  viewportFrom,
  type GamUnit,
} from '@/lib/gam'

/**
 * The 30 GPT paths on the network's tag sheet ("Tags Google Ad Manager — Lalla Fatema",
 * 06/10/2026), transcribed independently of the registry so a typo in either shows up.
 */
const SHEET_PATHS = [
  '/32994918/35',
  '/32994918/LallaFatima_Billboard_HP',
  '/32994918/LallaFatima_Billboard_HP_PB',
  '/32994918/LallaFatima_Billboard_HP_PB_2',
  '/32994918/LallaFatima_Billboard_RG',
  '/32994918/LallaFatima_Billboard_RG_PB',
  '/32994918/LallaFatima_BTF_AS',
  '/32994918/LallaFatima_BTF_AS_PB',
  '/32994918/LallaFatima_Habillage_HP',
  '/32994918/LallaFatima_Habillage_RG',
  '/32994918/LallaFatima_Halfpage_1',
  '/32994918/LallaFatima_Halfpage_1_PB',
  '/32994918/LallaFatima_Halfpage_1_PB_2',
  '/32994918/LallaFatima_Halfpage_2',
  '/32994918/LallaFatima_Halfpage_2_PB',
  '/32994918/LallaFatima_Halfpage_2_PB_2',
  '/32994918/LallaFatima_Halfpage_3',
  '/32994918/LallaFatima_Halfpage_3_PB',
  '/32994918/LallaFatima_Halfpage_3_PB_2',
  '/32994918/LallaFatima_Halfpage_4',
  '/32994918/LallaFatima_Halfpage_4_PB',
  '/32994918/LallaFatima_Header',
  '/32994918/LallaFatima_Header_PB',
  '/32994918/LallaFatima_Header_PB_2',
  '/32994918/LallaFatima_M_320x100_MITOP_AS',
  '/32994918/LallaFatima_M_320x50_BTF_AS',
  '/32994918/LallaFatima_M_320x50_BTF_AS_PB',
  '/32994918/LallaFatima_M_320x50_MITOP_AS',
  '/32994918/LallaFatima_M_320x50_MITOP_AS_PB',
  '/32994918/LallaFatima_M_320x50_MITOP_AS_PB_2',
]

const units = Object.keys(GAM_UNITS) as GamUnit[]

/**
 * Every size the sheet allows each family to request, on any viewport. First match wins,
 * so the phone families come before `_BTF_AS`, which their names also contain.
 */
const SHEET_SIZES: [RegExp, string[]][] = [
  [/_M_320x100_/, ['320x100']],
  [/_M_320x50_/, ['320x50']],
  [/^35$/, ['300x250', '300x600', '640x360']],
  [/_Billboard_/, ['728x90', '970x90', '970x250']],
  [/_BTF_AS/, ['728x90', '970x90']],
  [/_Habillage_/, ['1x1']],
  [/_Halfpage_/, ['300x250', '300x600']],
  [/_Header/, ['728x90']],
]

describe('Ad Manager registry', () => {
  it('carries exactly the 30 units on the tag sheet, on network 32994918', () => {
    expect(GAM_NETWORK_CODE).toBe('32994918')
    expect(units.map(gamPath).sort()).toEqual([...SHEET_PATHS].sort())
  })

  it('gives every unit its own container id, in the sheet’s div-gpt-<code> form', () => {
    const ids = units.map(gamDivId)
    expect(new Set(ids).size).toBe(units.length)
    expect(gamDivId('Inread')).toBe('div-gpt-35')
    expect(gamDivId('Header')).toBe('div-gpt-LallaFatima_Header')
  })

  it('never requests a size the sheet does not list for that unit', () => {
    for (const name of units) {
      const code = GAM_UNITS[name].code
      const family = SHEET_SIZES.find(([re]) => re.test(code))
      expect(family, `no sheet sizes for ${code}`).toBeDefined()
      for (const v of VIEWPORTS) {
        for (const [w, h] of gamSizes(name, v)) {
          expect(family![1], `${code} on ${v}`).toContain(`${w}x${h}`)
        }
      }
    }
  })

  it('only offers sizes that fit the viewport', () => {
    for (const name of units) {
      for (const [w] of gamSizes(name, 'phone')) expect(w).toBeLessThanOrEqual(320)
      for (const [w] of gamSizes(name, 'tablet')) expect(w).toBeLessThan(768)
    }
  })

  it('keeps phone units on phones and the skin on desktop', () => {
    expect(slotViewports('M_320x50_BTF_AS')).toEqual(['phone'])
    expect(slotViewports('M_320x100_MITOP_AS')).toEqual(['phone'])
    expect(slotViewports('Habillage_HP')).toEqual(['desktop'])
    expect(slotViewports('Billboard_HP')).toEqual(['tablet', 'desktop'])
    expect(slotViewports('Halfpage_1')).toEqual(['phone', 'tablet', 'desktop'])
  })

  it('narrows to the caller’s viewports and drops ones the unit cannot serve', () => {
    expect(slotViewports('Halfpage_1', ['desktop'])).toEqual(['desktop'])
    expect(slotViewports('Billboard_RG_PB', ['phone', 'desktop'])).toEqual(['desktop'])
    expect(slotViewports('M_320x50_MITOP_AS', ['tablet', 'desktop'])).toEqual([])
  })

  it('identifies only the two Habillage units as skins', () => {
    expect(units.filter(isSkinUnit).sort()).toEqual(['Habillage_HP', 'Habillage_RG'])
  })

  it('reserves the shortest creative by default and the tallest on request', () => {
    expect(reserveHeight('Billboard_HP', 'desktop')).toBe(90)
    expect(reserveHeight('Billboard_HP', 'desktop', 'max')).toBe(250)
    expect(reserveHeight('Billboard_HP', 'tablet', 'max')).toBe(90)
    expect(reserveHeight('Halfpage_2', 'desktop', 'max')).toBe(600)
    expect(reserveHeight('Inread', 'phone')).toBe(250)
    expect(reserveHeight('M_320x50_BTF_AS', 'desktop')).toBe(0)
  })

  it('maps the md/lg media-query results to a viewport', () => {
    expect(viewportFrom(false, false)).toBe('phone')
    expect(viewportFrom(true, false)).toBe('tablet')
    expect(viewportFrom(true, true)).toBe('desktop')
  })
})
