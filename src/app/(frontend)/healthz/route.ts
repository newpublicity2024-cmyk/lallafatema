import { type NextRequest, NextResponse } from 'next/server'

import { healthDeepCheckRequested } from '@/lib/health'
import { getPayloadClient } from '@/lib/payload'

// Never statically generated; must reflect live state on each request.
export const dynamic = 'force-dynamic'

const NOINDEX = { 'X-Robots-Tag': 'noindex' } as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deep = healthDeepCheckRequested({
    deepParam: req.nextUrl.searchParams.get('deep'),
    headerSecret: req.headers.get('x-health-secret'),
  })

  // Public liveness: fast, no DB touch.
  if (!deep) {
    return NextResponse.json({ status: 'ok' }, { headers: NOINDEX })
  }

  // Secret-gated readiness: cheap DB ping via the Postgres pool.
  try {
    const payload = await getPayloadClient()
    const db = payload.db as unknown as { pool: { query: (q: string) => Promise<unknown> } }
    await db.pool.query('SELECT 1')
    return NextResponse.json({ status: 'ok', db: 'ok' }, { headers: NOINDEX })
  } catch {
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503, headers: NOINDEX })
  }
}
