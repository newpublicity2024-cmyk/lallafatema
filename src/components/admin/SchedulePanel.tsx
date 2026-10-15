'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { scheduleLabel, scheduleStateOf, type ScheduleState } from '../../lib/schedule'

/**
 * Says, in words, what will happen to this article — the missing half of the publish-date
 * picker it sits above.
 *
 * The picker alone leaves a writer guessing: they set 14:00, press «نشر», and the article
 * vanishes from the site with no explanation. This states the outcome instead: programmed
 * for Thursday 14:30, newsroom time.
 *
 * Advisory only, like `PublishChecklist` — it reads the form and writes nothing. Shown to
 * every role: an editor scheduling a cover story needs the same sentence a journalist does.
 */

const TONE: Record<ScheduleState, { bg: string; border: string; icon: string; title: string }> = {
  draft: {
    bg: 'var(--theme-elevation-50)',
    border: 'var(--theme-elevation-150)',
    icon: '📝',
    title: 'مسوّدة — لم تُنشر بعد',
  },
  scheduled: {
    bg: 'var(--lf-brand-soft, var(--theme-elevation-50))',
    border: 'var(--lf-brand, var(--theme-elevation-150))',
    icon: '⏰',
    title: 'مبرمج للنشر',
  },
  live: {
    bg: 'var(--theme-elevation-50)',
    border: 'var(--theme-elevation-150)',
    icon: '✅',
    title: 'منشور على الموقع',
  },
}

export default function SchedulePanel() {
  const [status, publishedAt] = useFormFields(([fields]) => [
    fields?._status?.value,
    fields?.publishedAt?.value,
  ])

  /*
   * `_status` is a real field (Payload adds it to every drafts-enabled collection) but it
   * is registered with `components.Field: false`, so nothing renders it and its presence in
   * form state is an implementation detail rather than a contract. `hasPublishedDoc` from
   * `useDocumentInfo` is the supported signal — it is what Payload's own publish button
   * reads — so it stands in whenever `_status` is absent.
   *
   * Preferring `_status` when it IS there is deliberate: it tracks the form, so the panel
   * answers the question the writer is actually asking while they sit on the picker — "what
   * will saving this do?" — rather than describing the last saved version.
   */
  const { hasPublishedDoc } = useDocumentInfo()
  const isPublished = status === undefined || status === null ? hasPublishedDoc : status === 'published'

  /*
   * The state depends on the wall clock, so it is derived in an effect rather than during
   * render: computing it on the server pass and again on the client produces two different
   * answers for a post due in the next second, which is a hydration mismatch. `null` until
   * mounted renders nothing on the server, then the real state on the client.
   *
   * A scheduled post also stops being scheduled on its own, with no form event to trigger
   * a re-render — hence the interval, which keeps the sentence honest while the tab sits
   * open. 30s is well under the granularity the label shows (minutes).
   */
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    /*
     * The first read is deferred to a timeout rather than called in the effect body. Both
     * forms land the clock on the client only — which is what avoids the mismatch — but a
     * synchronous `setNow` here is a cascading render, and `react-hooks/set-state-in-effect`
     * correctly rejects it. A 0ms timeout is a callback, so the state arrives on the next
     * task instead of during the effect, with no visible delay.
     */
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  if (now === null) return null

  const date = typeof publishedAt === 'string' ? publishedAt : null
  const state = scheduleStateOf({ _status: isPublished ? 'published' : 'draft', publishedAt: date }, now)
  const tone = TONE[state]

  return (
    <div
      dir="rtl"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: '.5rem',
        padding: '.7rem .85rem',
        marginBottom: '1rem',
        lineHeight: 1.7,
        fontSize: '.85rem',
      }}
    >
      <strong style={{ display: 'block' }}>
        <span aria-hidden style={{ marginInlineEnd: '.35rem' }}>
          {tone.icon}
        </span>
        {tone.title}
      </strong>

      {state === 'scheduled' && date && (
        <span style={{ display: 'block', marginTop: '.2rem' }}>
          يظهر للزوّار تلقائيًا {scheduleLabel(date, new Date(now))}. حتى ذلك الحين لا يراه أحد غيرك.
        </span>
      )}

      {state === 'live' && date && (
        <span style={{ display: 'block', marginTop: '.2rem', opacity: 0.85 }}>
          نُشر {scheduleLabel(date, new Date(now))}.
        </span>
      )}

      {state === 'draft' && (
        <span style={{ display: 'block', marginTop: '.2rem', opacity: 0.85 }}>
          لبرمجة النشر: اختر موعدًا في المستقبل من «موعد النشر» أدناه ثم اضغط «نشر».
        </span>
      )}
    </div>
  )
}
