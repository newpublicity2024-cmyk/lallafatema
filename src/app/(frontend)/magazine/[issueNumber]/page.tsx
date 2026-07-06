import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { PdfFacade } from '@/components/PdfFacade'
import { formatDate } from '@/lib/format'
import { getMagazineIssueByNumber, getSiteConfig } from '@/lib/queries'
import { issueNumberFromParam, magazineArchiveUrl, magazineIssueUrl } from '@/lib/routes'
import { breadcrumbJsonLd, buildMetadata, ogImageUrl, publicationIssueJsonLd } from '@/lib/seo'

export const revalidate = 3600

type Props = { params: Promise<{ issueNumber: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { issueNumber } = await params
  const n = issueNumberFromParam(issueNumber)
  if (n === null) return {}
  const issue = await getMagazineIssueByNumber(n)
  if (!issue) return {}
  const cfg = await getSiteConfig()
  const title = issue.title || `العدد ${issue.issueNumber}`
  return buildMetadata({
    title,
    description: issue.description,
    path: magazineIssueUrl(issue),
    image: ogImageUrl(issue.cover, cfg.defaultOgImage),
  })
}

export default async function MagazineIssuePage({ params }: Props) {
  const { issueNumber } = await params
  const n = issueNumberFromParam(issueNumber)
  if (n === null) notFound()

  const issue = await getMagazineIssueByNumber(n)
  if (!issue) notFound()

  const pdf = typeof issue.pdf === 'object' ? issue.pdf : null
  const title = issue.title || `العدد ${issue.issueNumber}`

  return (
    <main className="lf-container py-8">
      <JsonLd data={publicationIssueJsonLd(issue)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'المجلة', url: magazineArchiveUrl() },
          { name: title, url: magazineIssueUrl(issue) },
        ])}
      />

      <nav aria-label="مسار التنقل" className="mb-4 text-sm text-zinc-500">
        <Link href="/" className="hover:text-brand-600">
          الرئيسية
        </Link>
        {' / '}
        <Link href={magazineArchiveUrl()} className="hover:text-brand-600">
          المجلة
        </Link>
        {' / '}
        <span className="text-zinc-700">{title}</span>
      </nav>

      <header className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-zinc-900">{title}</h1>
        {issue.publishDate && (
          <time
            dateTime={new Date(issue.publishDate).toISOString()}
            className="mt-1 block text-sm text-zinc-500"
          >
            {formatDate(issue.publishDate)}
          </time>
        )}
        {issue.description && (
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
            {issue.description}
          </p>
        )}
      </header>

      {pdf?.url ? (
        <PdfFacade pdfUrl={pdf.url} cover={issue.cover} title={title} />
      ) : (
        <p className="py-8 text-center text-zinc-500">ملف العدد غير متوفر حاليًا.</p>
      )}
    </main>
  )
}
