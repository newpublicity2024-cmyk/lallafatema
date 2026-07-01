import Image from 'next/image'

import type { Ad } from '@/payload-types'
import { getActiveAd } from '@/lib/queries'
import { AdScript } from './AdScript'

type Placement = Ad['placement']

/**
 * Reserved box per placement → the slot occupies its final height before the
 * creative loads, so ads never shift surrounding content (zero CLS). Widths are
 * capped to standard ad sizes and centered; images use `object-contain` so any
 * aspect ratio sits inside the reserved height without distortion.
 */
const PLACEMENT_BOX: Record<Placement, string> = {
  header: 'mx-auto h-[90px] w-full max-w-[728px]',
  sidebar: 'mx-auto h-[250px] w-full max-w-[300px]',
  'in-article': 'mx-auto h-[280px] w-full max-w-[336px]',
  'between-sections': 'mx-auto h-[90px] w-full max-w-[728px]',
  footer: 'mx-auto h-[90px] w-full max-w-[728px]',
  popup: 'h-[250px] w-[300px]',
}

/**
 * Renders the active ad for a placement, or nothing when none is scheduled.
 * Async server component — fetches via `getActiveAd` (schedule window enforced in
 * the query). Pass `categoryId` on category/article pages to honor ad targeting.
 */
export async function AdSlot({
  placement,
  categoryId,
  className = '',
}: {
  placement: Placement
  categoryId?: number
  className?: string
}) {
  const ad = await getActiveAd(placement, categoryId)
  if (!ad) return null

  const box = PLACEMENT_BOX[placement]

  if (ad.format === 'image') {
    const media = ad.image && typeof ad.image === 'object' ? ad.image : null
    if (!media?.url) return null
    const img = (
      <Image
        src={media.url}
        alt={ad.alt || media.alt || ad.title}
        fill
        sizes="(max-width: 768px) 100vw, 728px"
        className="object-contain"
      />
    )
    return (
      <aside aria-label="إعلان" className={`relative overflow-hidden ${box} ${className}`}>
        {ad.targetUrl ? (
          <a
            href={ad.targetUrl}
            target={ad.newTab ? '_blank' : undefined}
            rel={ad.newTab ? 'noopener noreferrer sponsored' : 'sponsored'}
            className="block h-full w-full"
          >
            {img}
          </a>
        ) : (
          img
        )}
      </aside>
    )
  }

  // format: script (ad-network unit)
  return (
    <aside aria-label="إعلان" className={`relative overflow-hidden ${box} ${className}`}>
      <AdScript bodyHtml={ad.bodyScript} headHtml={ad.headScript} />
    </aside>
  )
}
