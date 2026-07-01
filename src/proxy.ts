import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type RedirectMap = Record<string, { to: string; type: number }>

/**
 * Exact-path 301/302 redirects, sourced from the admin-editable Redirects collection
 * via the cached `/redirects-map.json` route. Kept deliberately small (groundwork);
 * wildcard/regex matching and the bulk WordPress map land in Phase 7. Any failure to
 * load the map falls through to `next()` so a redirect glitch never takes the site down.
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
  return NextResponse.next()
}

// Skip admin, api, Next internals, and the map route itself (avoids a self-fetch loop).
// Intentionally does NOT exclude paths with extensions — legacy URLs like /old.html
// must remain redirectable when the Phase 7 WordPress map lands.
export const config = {
  matcher: ['/((?!admin|api|_next|redirects-map).*)'],
}
