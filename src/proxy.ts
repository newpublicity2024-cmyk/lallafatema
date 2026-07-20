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
 * Exact-path 301/302 redirects, sourced from the admin-editable Redirects collection
 * via the cached `/redirects-map.json` route. Kept deliberately small (groundwork);
 * wildcard/regex matching and the bulk WordPress map land in Phase 7. Any failure to
 * load the map falls through to `next()` so a redirect glitch never takes the site down.
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
      const hit = map[pathname]
      if (hit) {
        return NextResponse.redirect(new URL(hit.to, req.url), hit.type)
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
