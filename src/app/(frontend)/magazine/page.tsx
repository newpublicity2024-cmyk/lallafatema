import type { Metadata } from 'next'

import { IssueCard } from '@/components/IssueCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getMagazineIssues, getSiteConfig } from '@/lib/queries'
import { magazineArchiveUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl } from '@/lib/seo'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'أرشيف المجلة',
    description: 'تصفّحي أعداد مجلة لالة فاطمة الرقمية، واقرئي أو حمّلي كل عدد بصيغة PDF.',
    path: magazineArchiveUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
  })
}

export default async function MagazinePage() {
  const issues = await getMagazineIssues()

  return (
    <main className="lf-container py-8">
      <SectionHeading title="أعداد المجلة" />
      {issues.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">لا توجد أعداد بعد.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </main>
  )
}
