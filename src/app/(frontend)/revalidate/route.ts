import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Secret-protected on-demand revalidation endpoint.
 *   GET /revalidate?secret=<REVALIDATE_SECRET>&path=/some/path
 * Defaults to revalidating the whole frontend. Payload's afterChange hooks
 * revalidate in-process; this endpoint covers manual/external triggers.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ revalidated: false, message: 'Invalid secret' }, { status: 401 })
  }

  const path = req.nextUrl.searchParams.get('path')
  if (path) {
    revalidatePath(path)
  } else {
    revalidatePath('/', 'layout')
  }

  return NextResponse.json({ revalidated: true, path: path ?? '/(layout)', now: Date.now() })
}
