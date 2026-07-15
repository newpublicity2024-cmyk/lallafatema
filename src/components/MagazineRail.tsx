import Link from 'next/link'

import type { MagazineIssue } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { magazineArchiveUrl, magazineIssueUrl } from '@/lib/routes'
import { PostImage } from './PostImage'

/**
 * Compact "latest issue" rail shown inside the featured celebrity (مشاهير) block, in its
 * own narrow column. Different from `MagazineSection` (the full-bleed dark shelf band on
 * the homepage): this one takes a single issue, not a list, and is meant to sit beside a
 * post list rather than span the page.
 */
export function MagazineRail({ issue }: { issue: MagazineIssue }) {
  const title = issue.title || `العدد ${issue.issueNumber}`
  const href = magazineIssueUrl(issue)

  return (
    <aside className="flex flex-col border-t border-zinc-300 pt-5 lg:border-t-0 lg:border-s lg:ps-6 lg:pt-0">
      <h3 className="text-center text-xl font-bold text-zinc-900">إصدارات المجلة</h3>
      {issue.publishDate && (
        <time
          dateTime={new Date(issue.publishDate).toISOString()}
          className="mt-1 block text-center text-xs text-zinc-600"
        >
          {formatDate(issue.publishDate)}
        </time>
      )}
      <Link
        href={href}
        className="group mx-auto mt-4 block w-full max-w-[220px] bg-white p-2 shadow-[0_2px_14px_rgba(0,0,0,0.12)]"
      >
        {/* The padded mat can't be the positioned ancestor — `fill` ignores its
            padding — so this inner box reserves the ratio instead. */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <PostImage
            image={issue.cover}
            alt={title}
            sizes="220px"
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </Link>
      <Link
        href={href}
        className="mt-3 block text-center text-sm font-bold text-brand-600 hover:underline"
      >
        النسخة الرقمية
      </Link>
      <Link
        href={magazineArchiveUrl()}
        className="mt-4 block border-t border-zinc-300 pt-3 text-center text-xs text-zinc-600 hover:text-brand-600"
      >
        كل الأعداد ←
      </Link>
    </aside>
  )
}
