import { timingSafeEqual } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

import { dueSinceWhere, resolveWindowMinutes } from '@/lib/schedule'
import { getPayloadClient } from '@/lib/payload'
import { indexPost } from '@/lib/search'

/**
 * Makes a programmed article PUNCTUAL and SEARCHABLE the moment it falls due.
 *
 * Scheduling itself does not need this endpoint. A post with a future `publishedAt`
 * becomes readable on its own the instant the clock passes it — nothing has to run, which
 * is the whole reason this design beats a job queue. Two things, however, do not happen by
 * themselves:
 *
 *   1. CACHE. Every public page is ISR (`revalidate` 3600 on the homepage and the article,
 *      300 on a category). So an article due at 14:00 can take up to an hour to appear, and
 *      the article URL's own 404 — served while it was not yet due — is cached for just as
 *      long. One `revalidatePath('/', 'layout')` at the right moment collapses that to
 *      seconds, and it is the same call every publish already makes (hooks/revalidate.ts).
 *
 *   2. SEARCH. `indexPost` runs from the collection's `afterChange` hook, i.e. only when
 *      somebody saves. An article that becomes due with nobody editing it would never
 *      enter Meilisearch — unsearchable until its next edit or a full reindex.
 *
 * Idempotent by construction: revalidating and re-indexing the same post twice is free, so
 * overlapping runs and a window wider than the cron interval cost nothing. That is what
 * lets this work off a time window instead of a stored high-water mark, which would have
 * meant a new column on a database dev and production share.
 *
 * KNOWN LIMIT: a post that falls due while the cron is down for longer than `minutes` is
 * not picked up. It stays CORRECT — readers get it at the next natural ISR expiry — but
 * loses its exact minute and stays out of search. Catch one up by hand with
 * `?secret=…&minutes=1440`.
 *
 *   GET /publish-due                      (Vercel cron: Authorization: Bearer $CRON_SECRET)
 *   GET /publish-due?secret=$REVALIDATE_SECRET[&minutes=15]
 */

// Never prerendered or cached: the answer depends on the clock, and the whole point is to
// act on "now".
export const dynamic = 'force-dynamic'

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` rather than `===`, because `===` returns as soon as two bytes differ and
 * this is a secret compared on a public endpoint. The length check is not the guard — it is
 * required, since `timingSafeEqual` throws on mismatched lengths — and the length itself is
 * the one thing this cannot hide.
 *
 * A missing `expected` yields false, so with neither environment variable set the endpoint
 * is inert rather than open.
 */
const secretMatches = (given: string | null, expected: string | undefined): boolean => {
  if (!expected || typeof given !== 'string') return false
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorize(req: NextRequest): boolean {
  // Vercel attaches this header to its own cron invocations when CRON_SECRET is set.
  // Preferred over a query string because it keeps the secret out of vercel.json and out
  // of request logs.
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (secretMatches(bearer, process.env.CRON_SECRET)) return true
  // Manual / external trigger, matching the existing /revalidate endpoint's contract.
  return secretMatches(req.nextUrl.searchParams.get('secret'), process.env.REVALIDATE_SECRET)
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, message: 'Invalid secret' }, { status: 401 })
  }

  const minutes = resolveWindowMinutes(req.nextUrl.searchParams.get('minutes'))
  const now = new Date()
  const payload = await getPayloadClient()

  // `depth: 0` and a hard `limit`: this runs on a timer and must stay cheap — a hundred
  // articles falling due inside one window is already far beyond any real editorial day,
  // and a hand-made `?minutes=10080` catch-up must not try to load a week of the archive
  // into memory. Pagination is deliberately left ON: `pagination: false` would make
  // Payload ignore the limit and return every match, which is the opposite of the cap.
  const { docs } = await payload.find({
    collection: 'posts',
    where: dueSinceWhere(minutes, now),
    depth: 0,
    limit: 100,
    sort: 'publishedAt',
  })

  const ids = docs.map((d) => d.id)

  // Nothing fell due: return without touching the cache. Revalidating on every tick
  // regardless would throw away the ISR cache the site depends on — the cost this endpoint
  // exists to avoid paying.
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, due: 0, ids: [], revalidated: false, minutes })
  }

  // Search first, cache second: a reader who follows the freshly revalidated homepage into
  // the search box should not find the article missing from the index.
  // `indexPost` never throws (a search outage must not break publishing), so one bad
  // document cannot stop the others or skip the revalidation below.
  await Promise.all(ids.map((id) => indexPost(id as number)))

  let revalidated = true
  try {
    revalidatePath('/', 'layout')
  } catch {
    // Mirrors hooks/revalidate.ts: outside a request scope this is not available. Report
    // it rather than swallowing it — a cron that silently stopped refreshing the site is
    // exactly the failure this endpoint is meant to prevent.
    revalidated = false
  }

  return NextResponse.json({ ok: true, due: ids.length, ids, revalidated, minutes })
}
