import { isoDate, relativeTime } from '@/lib/format'

/** Server-rendered relative timestamp, e.g. "قبل ساعتين". */
export function RelativeTime({ date, className }: { date?: string | null; className?: string }) {
  if (!date) return null
  return (
    <time dateTime={isoDate(date)} className={className}>
      {relativeTime(date)}
    </time>
  )
}
