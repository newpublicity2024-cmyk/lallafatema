import Link from 'next/link'

import type { MagazineIssue } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { magazineIssueUrl } from '@/lib/routes'
import { PostImage } from './PostImage'

/**
 * One magazine issue: portrait cover + title + date.
 * `card` (default) is the white archive-grid card. `shelf` floats the cover on a
 * dark band (homepage) — no white box, white title, no card padding.
 */
export function IssueCard({
  issue,
  variant = 'card',
}: {
  issue: MagazineIssue
  variant?: 'card' | 'shelf'
}) {
  const title = issue.title || `العدد ${issue.issueNumber}`
  const href = magazineIssueUrl(issue)

  if (variant === 'shelf') {
    return (
      <article className="group flex flex-col">
        <Link
          href={href}
          className="relative block aspect-[3/4] overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10"
        >
          <PostImage
            image={issue.cover}
            alt={title}
            sizes="(max-width: 768px) 85vw, 16vw"
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="mt-3 text-center">
          <h3 className="text-sm font-medium leading-snug text-white group-hover:text-brand-200">
            <Link href={href}>{title}</Link>
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
    <article className="lf-card group flex flex-col">
      <Link href={href} className="relative block aspect-[3/4] overflow-hidden">
        <PostImage
          image={issue.cover}
          alt={title}
          sizes="(max-width: 768px) 50vw, 25vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="p-4">
        <h3 className="text-lg font-medium leading-snug text-zinc-900 group-hover:text-brand-700">
          <Link href={href}>{title}</Link>
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
