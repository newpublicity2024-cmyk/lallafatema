'use client'

import { usePathname } from 'next/navigation'

import { GamSlot } from './GamSlot'

/**
 * The run-of-site Ad Manager positions, mounted once in the root layout. Only Billboard
 * and Habillage are sold separately for the homepage (`_HP`) and the rest of the site
 * (`_RG`); the route decides which one a page carries.
 */
function useIsHome() {
  return usePathname() === '/'
}

/** Site skin (desktop only). Must render before the header: it is the page's first slot. */
export function GamSkin() {
  return <GamSlot unit={useIsHome() ? 'Habillage_HP' : 'Habillage_RG'} />
}

/** Top of every page, under the header: the billboard, or the 320x100 on a phone. */
export function GamTop() {
  const home = useIsHome()
  return (
    <>
      <GamSlot unit={home ? 'Billboard_HP' : 'Billboard_RG'} reserve="max" className="mt-4 px-4" />
      <GamSlot unit="M_320x100_MITOP_AS" reserve="max" className="mt-3 px-4" />
    </>
  )
}

/** Bottom of every page, above the footer. */
export function GamBottom() {
  return (
    <>
      <GamSlot unit="BTF_AS" className="mt-12 px-4" />
      <GamSlot unit="M_320x50_BTF_AS" className="mt-10 px-4" />
    </>
  )
}
