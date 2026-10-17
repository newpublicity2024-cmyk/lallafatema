import { timingSafeEqual } from 'node:crypto'

/**
 * Authorisation shared by the site's cron endpoints (`/publish-due`, `/sync-youtube`).
 *
 * Extracted rather than copied. Both endpoints are public URLs that do privileged work on
 * a timer, both accept the same two credentials, and a second hand-written copy of a
 * constant-time comparison is precisely the kind of code that drifts — one endpoint gets a
 * fix and the other quietly keeps the bug. There is now one definition, and
 * `tests/int/publish-due.int.spec.ts` plus `tests/int/sync-youtube.int.spec.ts` both
 * exercise it.
 *
 * Two accepted credentials, in order:
 *
 *   1. `Authorization: Bearer $CRON_SECRET` — what Vercel attaches to its own cron
 *      invocations when `CRON_SECRET` is set on the project. Preferred, because it keeps
 *      the secret out of `vercel.json` and out of request logs.
 *   2. `?secret=$REVALIDATE_SECRET` — the manual/external trigger, matching the contract
 *      the `/revalidate` endpoint already uses.
 *
 * With NEITHER environment variable set the endpoints are inert rather than open: a
 * missing `expected` can never match.
 */

type SecretRequest = {
  headers: { get(name: string): string | null }
  nextUrl: { searchParams: { get(name: string): string | null } }
}

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` rather than `===`, because `===` returns as soon as two bytes differ
 * and this is a secret compared on a public endpoint. The length check is not the guard —
 * it is required, since `timingSafeEqual` throws on mismatched lengths — and the length
 * itself is the one thing this cannot hide.
 */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!expected || typeof given !== 'string') return false
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** True when the request carries the Vercel cron bearer or the manual revalidate secret. */
export function authorizeCron(req: SecretRequest): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (secretMatches(bearer, process.env.CRON_SECRET)) return true
  return secretMatches(req.nextUrl.searchParams.get('secret'), process.env.REVALIDATE_SECRET)
}
