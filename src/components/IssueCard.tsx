import Link from 'next/link'

import type { MagazineIssue } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { magazineIssueUrl } from '@/lib/routes'
import { PostImage } from './PostImage'

/** One magazine issue in the archive grid: portrait cover + title + date. */
export function IssueCard({ issue }: { issue: MagazineIssue }) {
  const title = issue.title || `العدد ${issue.issueNumber}`
  const href = magazineIssueUrl(issue)

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
            className="mt-1 block text-xs text-zinc-500"
          >
            {formatDate(issue.publishDate)}
          </time>
        )}
      </div>
    </article>
  )
}
