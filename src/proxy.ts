import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type RedirectMap = Record<string, { to: string; type: number }>

/**
 * The production domain — the only host whose pages should be indexed. Matches
 * origins.ts's CANONICAL_ORIGIN. Every other host (Vercel preview/alias/deploy
 * URLs like *.vercel.app) is a non-canonical mirror of the same content whose
 * canonical tags already point here, so it must be kept out of search.
 */
const CANONICAL_HOST = 'lallafatema.ma'

/** True for the real domain (apex + any subdomain) and local dev; false for every mirror host. */
function isIndexableHost(host: string | null): boolean {
  if (!host) return false
  const h = host.split(':')[0].toLowerCase()
  return (
    h === CANONICAL_HOST ||
    h.endsWith(`.${CANONICAL_HOST}`) ||
    h === 'localhost' ||
    h === '127.0.0.1'
  )
}

/**
 * Candidate lookup keys for an incoming path, in order of preference.
 *
 * The stored `from` values and the incoming pathname are written in different dialects,
 * so an exact `map[pathname]` lookup misses every legacy WordPress URL:
 *
 *  - Encoding. `nextUrl.pathname` keeps whatever percent-encoding the client sent, and
 *    browsers/crawlers always encode non-ASCII — so an Arabic URL arrives as
 *    `/%D9%81%D9%88...`. The WordPress import stored `from` decoded (`/فوندان...`), via
 *    decodeURIComponent on the source URL. Encoded never equals decoded.
 *  - Trailing slash. WordPress served `/slug/`; this app serves `/slug`. Every imported
 *    entry carries the slash, and Next answers the slashed form with its own 308 to the
 *    unslashed one, so whichever form arrives here has to match the same entry.
 *
 * Checking all four combinations keeps a hand-entered redirect working too, whichever
 * way an editor happens to paste the old path.
 */
export function lookupKeys(pathname: string): string[] {
  const keys = new Set<string>()
  const addBothSlashForms = (p: string) => {
    if (!p) return
    keys.add(p)
    keys.add(p.endsWith('/') ? p.slice(0, -1) : `${p}/`)
  }
  addBothSlashForms(pathname)
  try {
    addBothSlashForms(decodeURIComponent(pathname))
  } catch {
    /* malformed %-sequence — the raw form above is all we can match on */
  }
  // '/' degrades to '' when the slash is stripped; never look that up.
  return [...keys].filter(Boolean)
}

/**
 * Exact-path 301/302 redirects, sourced from the admin-editable Redirects collection
 * via the cached `/redirects-map.json` route. Matching is exact but encoding- and
 * trailing-slash-insensitive (see lookupKeys). Any failure to load the map falls
 * through to `next()` so a redirect glitch never takes the site down.
 *
 * Also tags every response served from a non-canonical host with
 * `X-Robots-Tag: noindex, nofollow` so the Vercel staging deployment can't be
 * indexed while its canonicals point at the (not-yet-cut-over) production domain.
 * Uses noindex — not a robots disallow — so crawlers can still fetch the page and
 * see the directive. Switches off automatically once the site serves from
 * lallafatema.ma at DNS cutover.
 *
 * Uses Next 16's `proxy` file convention (the renamed `middleware`).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  try {
    const res = await fetch(new URL('/redirects-map.json', req.url), {
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const map = (await res.json()) as RedirectMap
      const hit = lookupKeys(pathname)
        .map((key) => map[key])
        .find(Boolean)
      if (hit) {
        // Carry the query string over so campaign/referral params survive the hop.
        const target = new URL(hit.to, req.url)
        if (!target.search) target.search = req.nextUrl.search
        return NextResponse.redirect(target, hit.type)
      }
    }
  } catch {
    /* map unavailable — serve normally */
  }
  const res = NextResponse.next()
  if (!isIndexableHost(req.headers.get('host'))) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return res
}

// Skip admin, api, Next internals, and the map route itself (avoids a self-fetch loop).
// Intentionally does NOT exclude paths with extensions — legacy URLs like /old.html
// must remain redirectable when the Phase 7 WordPress map lands.
export const config = {
  matcher: ['/((?!admin|api|_next|redirects-map).*)'],
}
