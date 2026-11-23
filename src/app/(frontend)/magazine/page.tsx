import type { Metadata } from 'next'

import { MagazineArchive } from '@/components/MagazineArchive'
import { SectionHeading } from '@/components/SectionHeading'
import { getMagazineIssueBatch, getSiteConfig } from '@/lib/queries'
import { magazineArchiveUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl } from '@/lib/seo'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'أرشيف المجلة',
    description: 'تصفّحي أعداد مجلة لالة فاطمة، واقرئي أو حمّلي الأعداد المتوفرة بصيغة PDF.',
    path: magazineArchiveUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
  })
}

export default async function MagazinePage() {
  // The newest batch only; older issues arrive through the archive's "load more".
  const first = await getMagazineIssueBatch()

  return (
    <div className="lf-container py-8">
      <SectionHeading title="أعداد المجلة" />
      <p className="mb-8 max-w-2xl text-zinc-600">
        تصفّحي أعداد مجلة لالة فاطمة، واقرئي أو حمّلي الأعداد المتوفرة بصيغة PDF.
      </p>
      {first.issues.length === 0 ? (
        <p className="py-16 text-center text-zinc-700">لا توجد أعداد بعد.</p>
      ) : (
        <MagazineArchive initial={first} />
      )}
    </div>
  )
}
