import type { Where } from 'payload'

import { isScheduledForLater } from './published-where'

/**
 * Scheduled ("programmed") publishing — the back-office half.
 *
 * The site's public half already exists and predates this module: one rule in
 * `published-where.ts` — published AND due — is applied by every reader-facing surface
 * (listings, the article URL, REST/GraphQL access, sitemap, the Meilisearch indexer). A
 * post with `_status: 'published'` and a FUTURE `publishedAt` is therefore already
 * invisible to the public and already becomes visible on its own when the clock passes it.
 *
 * So scheduling needs no new column and no job queue. What it needs — and what lives here
 * — is a name for that third state, so the admin can stop calling such a post "published"
 * and start telling its author when it goes live.
 *
 * Why NOT Payload 3.85's native `versions.drafts.schedulePublish`: it requires the
 * `payload_jobs` tables, i.e. a migration against a Neon instance that dev and production
 * share, plus a cron whose failure means the article never publishes AT ALL. Date-gating
 * cannot miss a publish — nothing has to run for the article to become due.
 */

/** The newsroom's clock. The server runs UTC on Vercel; editorial thinks in Casablanca. */
export const NEWSROOM_TZ = 'Africa/Casablanca'

export type ScheduleState = 'draft' | 'scheduled' | 'live'

type SchedulableDoc = {
  _status?: ('draft' | 'published') | null
  publishedAt?: string | null
}

/**
 * The three states an article can be in, as editorial experiences them.
 *
 * `scheduled` is not a stored value — it is `published` plus a date that has not arrived.
 * Deriving it (rather than adding a status) is what keeps every existing query, hook and
 * page correct without being touched.
 */
export const scheduleStateOf = (doc: SchedulableDoc, now?: number): ScheduleState => {
  if (doc._status !== 'published') return 'draft'
  return isDueLater(doc.publishedAt, now) ? 'scheduled' : 'live'
}

/**
 * True when a date is set and still in the future.
 *
 * With no clock passed — which is every production call — this IS the public rule: it
 * delegates to `isScheduledForLater`, so the admin's reading of "not yet live" and the
 * reader's cannot drift apart. The explicit `now` exists for checks and tests that need a
 * fixed clock, and runs the identical comparison against it.
 *
 * A malformed date yields `false` (NaN compares false), i.e. "treat it as live" — the same
 * choice `publishedWhere()` makes for a missing date: a row with a bad value must not
 * silently vanish from the site.
 */
export const isDueLater = (publishedAt: unknown, now?: number): boolean =>
  now === undefined
    ? isScheduledForLater(publishedAt)
    : typeof publishedAt === 'string' && new Date(publishedAt).getTime() > now

/**
 * Posts that are programmed but not yet live.
 *
 * `exists: true` matters: `applyPostDefaults` stamps `publishedAt` on first publish, but a
 * row that somehow lacks one is treated as live by `publishedWhere()`, and the two rules
 * must agree about it or a post could be in both lists or neither.
 */
export const scheduledWhere = (now = new Date()): Where => ({
  and: [
    { _status: { equals: 'published' } },
    { publishedAt: { exists: true } },
    { publishedAt: { greater_than: now.toISOString() } },
  ],
})

/** Covers a 5-minute cron with 3× slack, so one missed run still catches up. */
export const DEFAULT_WINDOW_MINUTES = 15

/** A week. Enough for any hand-run catch-up; short of "scan the whole archive". */
export const MAX_WINDOW_MINUTES = 60 * 24 * 7

/**
 * Turns a `?minutes=` parameter into a usable window.
 *
 * Policy, not parsing, which is why it lives beside the rule it feeds rather than in the
 * route: anything absent, junk, zero or negative falls back to the default (a zero window
 * selects nothing, so a due article would be skipped in silence), and anything enormous is
 * clamped so one mistyped URL cannot pull the archive into memory.
 */
export const resolveWindowMinutes = (raw: string | null | undefined): number => {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_MINUTES
  return Math.min(n, MAX_WINDOW_MINUTES)
}

/**
 * Posts whose moment arrived during the window ending now — what the due-check endpoint
 * acts on.
 *
 * A window rather than a high-water mark because a stored marker would mean a new column
 * on a shared database, and because everything the endpoint does (revalidate, re-index) is
 * idempotent, so overlapping runs are free. The cost is bounded and documented: an outage
 * longer than the window delays a post to the natural ISR expiry instead of its exact
 * minute. The endpoint takes `?minutes=` for catching that up by hand.
 */
export const dueSinceWhere = (minutes: number, now = new Date()): Where => {
  // Clamp to at least one minute, and treat a non-finite value as one minute rather than
  // producing an Invalid Date: a zero or negative window asks for `publishedAt > now AND
  // <= now`, which matches nothing, so a due post would be skipped in silence instead of
  // the bad argument being obvious. (`Math.max(1, NaN)` is NaN, hence the explicit test.)
  const window = Number.isFinite(minutes) ? Math.max(1, minutes) : 1
  const from = new Date(now.getTime() - window * 60_000)
  return {
    and: [
      { _status: { equals: 'published' } },
      { publishedAt: { greater_than: from.toISOString() } },
      { publishedAt: { less_than_equal: now.toISOString() } },
    ],
  }
}

// ── Newsroom-time labels for the admin ────────────────────────────────────────

/**
 * Formatters are module-level singletons: `Intl.DateTimeFormat` construction is the
 * expensive part, and a dashboard widget renders one per row.
 *
 * `timeZone` is pinned to Casablanca on purpose. The admin is read in Morocco, the server
 * is UTC, and an unqualified "14:00" that silently meant a different hour to the server
 * than to the writer is exactly the failure this label exists to prevent — so the output
 * always carries the zone's name.
 */
const dayAndTime = new Intl.DateTimeFormat('ar', {
  timeZone: NEWSROOM_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeOnly = new Intl.DateTimeFormat('ar', {
  timeZone: NEWSROOM_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dayOnly = new Intl.DateTimeFormat('ar', {
  timeZone: NEWSROOM_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const asDate = (value: string | Date): Date | null => {
  const d = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(d.getTime()) ? null : d
}

/** "الخميس 15 أكتوبر، 14:30" — the full moment, in newsroom time. */
export const newsroomDayAndTime = (value: string | Date): string => {
  const d = asDate(value)
  return d ? dayAndTime.format(d) : ''
}

/** "14:30" — newsroom time, for a row that already shows the day. */
export const newsroomTime = (value: string | Date): string => {
  const d = asDate(value)
  return d ? timeOnly.format(d) : ''
}

/** "الخميس 15 أكتوبر" — newsroom date without the clock. */
export const newsroomDay = (value: string | Date): string => {
  const d = asDate(value)
  return d ? dayOnly.format(d) : ''
}

/**
 * Same calendar day in the newsroom? Lets a row say "اليوم 14:30" instead of repeating
 * today's date, which is the common case for a same-shift schedule.
 */
const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: NEWSROOM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const isSameNewsroomDay = (a: string | Date, b: string | Date): boolean => {
  const da = asDate(a)
  const db = asDate(b)
  return Boolean(da && db) && ymd.format(da as Date) === ymd.format(db as Date)
}

/**
 * The one sentence the admin shows a writer: when this article goes live, in their own
 * clock, with the zone named so it cannot be read as UTC.
 */
export const scheduleLabel = (publishedAt: string | Date, now: Date = new Date()): string => {
  const d = asDate(publishedAt)
  if (!d) return ''
  return isSameNewsroomDay(d, now)
    ? `اليوم ${newsroomTime(d)} (بتوقيت المغرب)`
    : `${newsroomDayAndTime(d)} (بتوقيت المغرب)`
}
