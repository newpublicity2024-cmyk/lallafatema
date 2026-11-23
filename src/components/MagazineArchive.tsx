'use client'

import { useEffect, useRef, useState } from 'react'

import { magazineBatchUrl, type IssueBatch, type IssueCardData } from '@/lib/magazine'
import { IssueCard } from './IssueCard'

/**
 * The `/magazine` grid with a "load more" button. The server renders the newest batch
 * (`initial`); each click fetches the next batch of OLDER issues from
 * `/magazine/issues?before=<last issue number on screen>` and appends it, until the
 * server says there is nothing older. Issues are de-duplicated by number, so a retried
 * or racing request can never show an issue twice.
 */
export function MagazineArchive({ initial }: { initial: IssueBatch }) {
  const [issues, setIssues] = useState<IssueCardData[]>(initial.issues)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  // A ref, not state: two clicks inside one render must not start two fetches.
  const inFlight = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const endRef = useRef<HTMLParagraphElement>(null)
  const focusEndOnDone = useRef(false)

  // When the last batch removes the button that had keyboard focus, hand focus to the
  // end-of-archive line instead of dropping it to <body>.
  useEffect(() => {
    if (!hasMore && focusEndOnDone.current) {
      focusEndOnDone.current = false
      endRef.current?.focus()
    }
  }, [hasMore])

  async function loadMore() {
    const last = issues.at(-1)
    if (!last || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setFailed(false)
    const hadFocus = document.activeElement === buttonRef.current
    try {
      const res = await fetch(magazineBatchUrl(last.issueNumber))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const batch = (await res.json()) as IssueBatch
      // `issues` is current here: `inFlight` allows one load at a time, and nothing else
      // changes the list. (Counting inside the setState updater would not work — React
      // runs updaters lazily, after this function has moved on.)
      const shown = new Set(issues.map((i) => i.issueNumber))
      const fresh = batch.issues.filter((i) => !shown.has(i.issueNumber))
      if (fresh.length) setIssues((prev) => [...prev, ...fresh])
      const added = fresh.length
      // An empty batch ends the archive even if a stale response claimed otherwise,
      // so the button can never spin on a cursor that yields nothing.
      const more = batch.hasMore && batch.issues.length > 0
      focusEndOnDone.current = !more && hadFocus
      setHasMore(more)
      setAnnouncement(added ? `تمت إضافة ${added} من الأعداد الأقدم.` : '')
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  return (
    <>
      <div
        className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        aria-busy={loading}
      >
        {issues.map((issue) => (
          <IssueCard key={issue.issueNumber} issue={issue} />
        ))}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {hasMore ? (
        <div className="mt-10 flex flex-col items-center gap-3">
          {failed && (
            <p role="alert" className="text-sm text-red-700">
              تعذّر تحميل الأعداد. حاولي مرة أخرى.
            </p>
          )}
          <button
            ref={buttonRef}
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-md bg-brand-600 px-8 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? 'جارٍ التحميل…' : 'عرض المزيد من الأعداد'}
          </button>
        </div>
      ) : (
        issues.length > initial.issues.length && (
          <p ref={endRef} tabIndex={-1} className="mt-10 text-center text-sm text-zinc-700 outline-none">
            وصلتِ إلى أقدم عدد في الأرشيف.
          </p>
        )
      )}
    </>
  )
}
