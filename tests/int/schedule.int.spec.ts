import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WINDOW_MINUTES,
  dueSinceWhere,
  isDueLater,
  MAX_WINDOW_MINUTES,
  resolveWindowMinutes,
  isSameNewsroomDay,
  newsroomDayAndTime,
  newsroomTime,
  NEWSROOM_TZ,
  scheduleLabel,
  scheduledWhere,
  scheduleStateOf,
} from '@/lib/schedule'
import { isScheduledForLater, publishedWhere } from '@/lib/published-where'

/**
 * Scheduling semantics. The round trip through Payload and Postgres is
 * `schedule-chain.int.spec.ts`; this file pins the rules those queries are built from.
 */

const AT = (iso: string) => new Date(iso).getTime()

describe('scheduleStateOf', () => {
  const now = AT('2026-10-13T12:00:00.000Z')

  it('calls a draft a draft, whatever its date', () => {
    expect(scheduleStateOf({ _status: 'draft', publishedAt: null }, now)).toBe('draft')
    expect(scheduleStateOf({ _status: 'draft', publishedAt: '2030-01-01T00:00:00.000Z' }, now)).toBe(
      'draft',
    )
    // A draft dated in the past is still a draft — the date alone never publishes anything.
    expect(scheduleStateOf({ _status: 'draft', publishedAt: '2020-01-01T00:00:00.000Z' }, now)).toBe(
      'draft',
    )
  })

  it('calls a published post with a future date scheduled', () => {
    expect(
      scheduleStateOf({ _status: 'published', publishedAt: '2026-10-13T12:00:01.000Z' }, now),
    ).toBe('scheduled')
  })

  it('calls a published post live from its moment onward', () => {
    // Exactly now is LIVE, not scheduled — the same boundary `publishedWhere()` uses
    // (`less_than_equal`), so the admin and the site agree on the instant itself.
    expect(scheduleStateOf({ _status: 'published', publishedAt: '2026-10-13T12:00:00.000Z' }, now)).toBe(
      'live',
    )
    expect(scheduleStateOf({ _status: 'published', publishedAt: '2026-10-13T11:59:59.000Z' }, now)).toBe(
      'live',
    )
  })

  it('treats a published post with no date as live', () => {
    // Matches `publishedWhere()`'s `exists: false` branch: a row that lost its date must
    // not disappear from the site, so it must not be reported as scheduled either.
    expect(scheduleStateOf({ _status: 'published', publishedAt: null }, now)).toBe('live')
    expect(scheduleStateOf({ _status: 'published' }, now)).toBe('live')
  })

  it('treats a malformed date as live rather than hiding the post forever', () => {
    expect(scheduleStateOf({ _status: 'published', publishedAt: 'not a date' }, now)).toBe('live')
  })
})

describe('isDueLater', () => {
  it('IS the public rule when no clock is passed', () => {
    // The guarantee that matters: the admin's notion of "not yet live" cannot drift from
    // the reader's. Asserted on values either side of the real now, not on a stub.
    const future = new Date(Date.now() + 60_000).toISOString()
    const past = new Date(Date.now() - 60_000).toISOString()
    for (const v of [future, past, null, undefined, '', 'rubbish']) {
      expect(isDueLater(v)).toBe(isScheduledForLater(v))
    }
    expect(isDueLater(future)).toBe(true)
    expect(isDueLater(past)).toBe(false)
  })

  it('compares against an explicit clock when given one', () => {
    const now = AT('2026-10-13T12:00:00.000Z')
    expect(isDueLater('2026-10-13T12:00:01.000Z', now)).toBe(true)
    expect(isDueLater('2026-10-13T11:59:59.000Z', now)).toBe(false)
  })
})

describe('scheduledWhere', () => {
  const now = new Date('2026-10-13T12:00:00.000Z')

  it('asks for published posts dated after now, and only those', () => {
    expect(scheduledWhere(now)).toEqual({
      and: [
        { _status: { equals: 'published' } },
        { publishedAt: { exists: true } },
        { publishedAt: { greater_than: '2026-10-13T12:00:00.000Z' } },
      ],
    })
  })

  it('partitions published posts with the site rule — no post is in both, none in neither', () => {
    /*
     * The structural guarantee behind the dashboard: `publishedWhere()` (what readers see)
     * and `scheduledWhere()` (what the admin lists as programmed) must be complements over
     * published posts. Asserted on the PREDICATES rather than on rows, by evaluating both
     * Where trees against the same candidate documents.
     *
     * Both must be evaluated on the SAME clock, and `publishedWhere()` deliberately takes
     * none — it calls `new Date()` itself so a long-running server cannot freeze it. So the
     * candidates are built as offsets from the real now rather than from fixed timestamps,
     * which is also what makes this a test of the two rules rather than of two clocks.
     */
    const site = publishedWhere()
    const real = new Date()
    const at = (msFromNow: number) => new Date(real.getTime() + msFromNow).toISOString()
    const candidates = [
      { _status: 'published', publishedAt: at(-60_000) }, // past
      { _status: 'published', publishedAt: at(60_000) }, // future
      { _status: 'published', publishedAt: at(7 * 86_400_000) }, // next week
      { _status: 'published', publishedAt: undefined }, // no date
    ]

    for (const doc of candidates) {
      const inSite = matches(site, doc)
      const inScheduled = matches(scheduledWhere(real), doc)
      expect(
        inSite !== inScheduled,
        `${JSON.stringify(doc)} is in ${inSite && inScheduled ? 'BOTH' : 'NEITHER'} list`,
      ).toBe(true)
    }
  })
})

describe('dueSinceWhere', () => {
  const now = new Date('2026-10-13T12:00:00.000Z')

  it('spans exactly the window ending now', () => {
    expect(dueSinceWhere(15, now)).toEqual({
      and: [
        { _status: { equals: 'published' } },
        { publishedAt: { greater_than: '2026-10-13T11:45:00.000Z' } },
        { publishedAt: { less_than_equal: '2026-10-13T12:00:00.000Z' } },
      ],
    })
  })

  it('never degenerates to a zero or negative window', () => {
    // A `?minutes=0` would otherwise ask for `publishedAt > now AND <= now` — empty, so a
    // due post would be silently skipped rather than the request being obviously wrong.
    for (const bad of [0, -5, Number.NaN]) {
      const where = dueSinceWhere(bad, now) as { and: Array<Record<string, never>> }
      const from = new Date(
        (where.and[1] as unknown as { publishedAt: { greater_than: string } }).publishedAt
          .greater_than,
      )
      expect(from.getTime()).toBeLessThan(now.getTime())
    }
  })
})

describe('resolveWindowMinutes', () => {
  it('falls back to the default for anything absent, junk, zero or negative', () => {
    // Each of these would otherwise produce an empty or invalid window, i.e. a cron tick
    // that silently finds nothing and leaves a due article uncached and unsearchable.
    for (const bad of [null, undefined, '', 'abc', '0', '-5', 'NaN', 'Infinity']) {
      expect(resolveWindowMinutes(bad), `"${bad}" should fall back`).toBe(DEFAULT_WINDOW_MINUTES)
    }
  })

  it('clamps an absurd window instead of scanning the archive', () => {
    expect(resolveWindowMinutes('999999999')).toBe(MAX_WINDOW_MINUTES)
    expect(resolveWindowMinutes(String(MAX_WINDOW_MINUTES + 1))).toBe(MAX_WINDOW_MINUTES)
  })

  it('passes a sensible window through unchanged', () => {
    expect(resolveWindowMinutes('7')).toBe(7)
    expect(resolveWindowMinutes('1440')).toBe(1440)
    expect(resolveWindowMinutes(String(MAX_WINDOW_MINUTES))).toBe(MAX_WINDOW_MINUTES)
  })

  it('defaults wide enough to survive a missed cron tick', () => {
    // vercel.json runs this every 5 minutes. A default narrower than the interval would
    // drop an article whose moment fell between two ticks.
    expect(DEFAULT_WINDOW_MINUTES).toBeGreaterThanOrEqual(10)
  })
})

describe('newsroom clock', () => {
  it('pins labels to Casablanca, not to the server zone', () => {
    expect(NEWSROOM_TZ).toBe('Africa/Casablanca')
    // 13:30 UTC in October is 14:30 in Casablanca (UTC+1). If this ever reads 13:30 the
    // formatter has fallen back to UTC and every scheduled time shown is an hour wrong.
    expect(newsroomTime('2026-10-13T13:30:00.000Z')).toContain('14')
    expect(newsroomTime('2026-10-13T13:30:00.000Z')).toContain('30')
  })

  it('tracks the Ramadan shift to UTC+0 rather than assuming a fixed offset', () => {
    /*
     * Morocco stays on UTC+1 all year EXCEPT Ramadan, when it drops to UTC+0. A hand-rolled
     * `+1` would be an hour wrong for a month — which is why this uses Intl and why the
     * difference is asserted rather than assumed. Ramadan 2027 begins ~8 February.
     * (During Ramadan 2027, 13:30 UTC is 13:30 local.)
     */
    const inRamadan = newsroomTime('2027-02-20T13:30:00.000Z')
    const outside = newsroomTime('2027-05-20T13:30:00.000Z')
    expect(inRamadan).not.toBe(outside)
    expect(inRamadan).toContain('13')
    expect(outside).toContain('14')
  })

  it('renders an Arabic day-and-time, not an ISO string', () => {
    const label = newsroomDayAndTime('2026-10-15T13:30:00.000Z')
    expect(label).toMatch(/[؀-ۿ]/) // contains Arabic
    expect(label).not.toContain('2026-10-15T')
  })

  it('returns an empty string for an unusable date instead of "Invalid Date"', () => {
    for (const bad of ['', 'rubbish', '2026-13-45']) {
      expect(newsroomTime(bad)).toBe('')
      expect(newsroomDayAndTime(bad)).toBe('')
      expect(scheduleLabel(bad)).toBe('')
    }
  })

  it('judges "same day" by the newsroom calendar, not UTC', () => {
    // 23:30 UTC on the 13th is already 00:30 on the 14th in Casablanca.
    expect(isSameNewsroomDay('2026-10-13T23:30:00.000Z', '2026-10-13T12:00:00.000Z')).toBe(false)
    expect(isSameNewsroomDay('2026-10-13T13:00:00.000Z', '2026-10-13T12:00:00.000Z')).toBe(true)
  })

  it('always names the zone, so a time can never be read as UTC', () => {
    const sameDay = scheduleLabel('2026-10-13T13:30:00.000Z', new Date('2026-10-13T09:00:00.000Z'))
    const otherDay = scheduleLabel('2026-10-16T13:30:00.000Z', new Date('2026-10-13T09:00:00.000Z'))
    expect(sameDay).toContain('بتوقيت المغرب')
    expect(otherDay).toContain('بتوقيت المغرب')
    expect(sameDay).toContain('اليوم')
    expect(otherDay).not.toContain('اليوم')
  })
})

// ── A tiny Where evaluator, enough for the predicates above ──────────────────

type Doc = Record<string, unknown>

function matches(where: unknown, doc: Doc): boolean {
  const w = where as Record<string, unknown>
  if (Array.isArray(w.and)) return (w.and as unknown[]).every((c) => matches(c, doc))
  if (Array.isArray(w.or)) return (w.or as unknown[]).some((c) => matches(c, doc))

  const [field, condition] = Object.entries(w)[0] as [string, Record<string, unknown>]
  const [op, operand] = Object.entries(condition)[0] as [string, unknown]
  const value = doc[field]

  switch (op) {
    case 'equals':
      return value === operand
    case 'exists':
      return (value !== undefined && value !== null) === operand
    case 'greater_than':
      return typeof value === 'string' && new Date(value) > new Date(operand as string)
    case 'less_than_equal':
      return typeof value === 'string' && new Date(value) <= new Date(operand as string)
    case 'greater_than_equal':
      return typeof value === 'string' && new Date(value) >= new Date(operand as string)
    default:
      throw new Error(`the test's Where evaluator does not implement "${op}"`)
  }
}
