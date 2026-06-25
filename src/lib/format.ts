/**
 * Arabic-correct date + relative-time formatting.
 * Uses the 'ar' locale so numerals/words render appropriately (e.g. "قبل ساعتين").
 */

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' })

const dateFmt = new Intl.DateTimeFormat('ar', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

/** "قبل ساعتين", "قبل 3 أيام", … */
export function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  let duration = (d.getTime() - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }
  return dateFmt.format(d)
}

/** "23 يونيو 2026" */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return dateFmt.format(d)
}

/** ISO string for <time dateTime>. */
export function isoDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString()
}
