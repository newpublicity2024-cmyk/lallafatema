import { NextResponse, type NextRequest } from 'next/server'

import { parseBeforeCursor } from '@/lib/magazine'
import { getMagazineIssueBatch } from '@/lib/queries'

/**
 * GET /magazine/issues?before=<issueNumber>
 *
 * The magazine archive's "load more" batch: the next published issues numbered below
 * `before` (the last issue already on screen), newest first, as `{ issues, hasMore }`.
 * The static `issues` segment wins over the sibling `[issueNumber]` page, and that page
 * only accepts digits, so the two never compete.
 *
 * Briefly CDN-cacheable (5 min, then stale-while-revalidate): it is public, published-only
 * data, and each click would otherwise be a database round-trip on the one Neon instance
 * that dev and production share.
 */
export async function GET(req: NextRequest) {
  const before = parseBeforeCursor(req.nextUrl.searchParams.get('before'))
  if (before === null) {
    return NextResponse.json(
      { error: '`before` must be a positive issue number' },
      { status: 400 },
    )
  }

  const batch = await getMagazineIssueBatch({ before })
  return NextResponse.json(batch, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  })
}
