import Link from 'next/link'
import type { ReactNode } from 'react'

import type { MagazineIssue, Media } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { issueHasPdf } from '@/lib/magazine'
import { magazineIssueUrl } from '@/lib/routes'
import { PostImage } from './PostImage'

/**
 * What a card reads. Structural, so both a full depth-1 `MagazineIssue` (homepage) and
 * the archive's trimmed `IssueCardData` (server batch + JSON batches) fit.
 */
export type IssueCardIssue = Pick<MagazineIssue, 'issueNumber' | 'title' | 'publishDate'> & {
  cover?: number | Pick<Media, 'url' | 'alt'> | null
  pdf?: number | Pick<Media, 'id'> | null
}

/**
 * One magazine issue: portrait cover + title + date.
 * `card` (default) is the white archive-grid card. `shelf` floats the cover on a
 * dark band (homepage) — no white box, white title, no card padding.
 *
 * An issue with a PDF links to its reader page. A cover-only archive issue (the
 * back-issues that survive only as a cover image) links nowhere and drops the hover
 * cues, so the grid never promises a reader it cannot open.
 */
export function IssueCard({
  issue,
  variant = 'card',
}: {
  issue: IssueCardIssue
  variant?: 'card' | 'shelf'
}) {
  const title = issue.title || `العدد ${issue.issueNumber}`
  const href = magazineIssueUrl(issue)
  const linked = issueHasPdf(issue)

  // The cover box and the title: wrapped in a link only when there is a PDF to open.
  const coverBox = (className: string, children: ReactNode) =>
    linked ? (
      <Link href={href} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    )
  const titleText = linked ? <Link href={href}>{title}</Link> : title
  const zoom = linked ? 'transition-transform duration-500 group-hover:scale-105' : ''

  if (variant === 'shelf') {
    return (
      <article className="group flex flex-col">
        {coverBox(
          'relative block aspect-[3/4] overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10',
          <PostImage
            image={issue.cover}
            alt={title}
            sizes="(max-width: 768px) 85vw, 16vw"
            className={zoom}
          />,
        )}
        <div className="mt-3 text-center">
          <h3
            className={`text-sm font-medium leading-snug text-white ${linked ? 'group-hover:text-brand-200' : ''}`}
          >
            {titleText}
          </h3>
          {issue.publishDate && (
            <time
              dateTime={new Date(issue.publishDate).toISOString()}
              className="mt-1 block text-xs text-white/60"
            >
              {formatDate(issue.publishDate)}
            </time>
          )}
        </div>
      </article>
    )
  }

  return (
    <article className="lf-card group flex flex-col" data-issue-number={issue.issueNumber}>
      {coverBox(
        'relative block aspect-[3/4] overflow-hidden',
        <PostImage
          image={issue.cover}
          alt={title}
          sizes="(max-width: 768px) 50vw, 25vw"
          className={zoom}
        />,
      )}
      <div className="p-4">
        <h3
          className={`text-lg font-medium leading-snug text-zinc-900 ${linked ? 'group-hover:text-brand-700' : ''}`}
        >
          {titleText}
        </h3>
        {issue.publishDate && (
          <time
            dateTime={new Date(issue.publishDate).toISOString()}
            className="mt-1 block text-xs text-zinc-700"
          >
            {formatDate(issue.publishDate)}
          </time>
        )}
      </div>
    </article>
  )
}
