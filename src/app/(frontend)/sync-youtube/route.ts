import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

import { authorizeCron } from '@/lib/cron-auth'
import { getPayloadClient } from '@/lib/payload'
import { parseChannelId, resolvedChannelId } from '@/lib/youtube'
import { runChannelSync } from '@/lib/youtube-sync'

/**
 * Keeps the site's copy of the Lalla Fatema YouTube channel current.
 *
 * This is what makes the homepage band self-maintaining: the channel publishes several
 * times a day, and nobody should have to open the admin for a new upload to appear. On a
 * tick this endpoint fetches the channel, upserts what changed, and — only if something
 * actually changed — purges the ISR cache so the new video is visible in seconds rather
 * than at the next natural expiry (3600s on the homepage, 300s on /videos).
 *
 * THE CONDITIONAL REVALIDATION IS THE WHOLE DESIGN. `revalidatePath('/', 'layout')`
 * purges the ISR cache for the ENTIRE site — every article and category, not just the
 * band — so firing it on every tick would throw the site's cache away 48 times a day for
 * a channel that posts a handful of times. That is the same cost `/publish-due` is
 * careful to avoid.
 *
 * `syncChannelVideos` therefore reports `changed` as "rows whose change a READER would
 * see". The distinction is load-bearing rather than pedantic: view counts move constantly
 * (measured live, a video went 167 -> 169 inside a minute) and are rendered nowhere, so
 * counting them would have made almost every tick purge the whole site to reflect a
 * number nobody is shown.
 *
 * Deliberately tolerant of a dead upstream: `fetchChannelVideos` resolves to an empty list
 * rather than throwing, and a sync of zero videos writes nothing. A YouTube outage leaves
 * the last good band in place; it does not empty the homepage.
 *
 *   GET /sync-youtube                    (Vercel cron: Authorization: Bearer $CRON_SECRET)
 *   GET /sync-youtube?secret=$REVALIDATE_SECRET[&channel=UC…]
 *
 * `?channel=` is an operator override for a one-off backfill of a different channel; it is
 * validated by `parseChannelId` and ignored when malformed, so the query string can never
 * steer a fetch at an arbitrary host.
 */

// Never prerendered or cached: the point of the endpoint is to act on "now".
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, message: 'Invalid secret' }, { status: 401 })
  }

  const requested = req.nextUrl.searchParams.get('channel')
  const channelId = (requested ? parseChannelId(requested) : null) ?? resolvedChannelId()

  const payload = await getPayloadClient()

  let result
  try {
    result = await runChannelSync({ payload, channelId })
  } catch (error) {
    // A cron that 500s silently is how a band goes stale for a month. Log it and answer
    // with a non-ok body the monitoring can see.
    payload.logger?.error?.({ err: error }, 'youtube sync failed')
    return NextResponse.json(
      { ok: false, message: 'sync failed', channelId },
      { status: 500 },
    )
  }

  // Nothing moved: return without touching the cache.
  if (result.changed === 0) {
    return NextResponse.json({ ...result, ok: true, revalidated: false })
  }

  let revalidated = true
  try {
    // The band is on the homepage and the listing is /videos; both sit under the root
    // layout, so one call covers them — the same call every publish already makes.
    revalidatePath('/', 'layout')
  } catch {
    // Mirrors hooks/revalidate.ts and /publish-due: outside a request scope this is not
    // available. Reported rather than swallowed, because a sync that stopped refreshing
    // the site is the exact failure this endpoint exists to prevent.
    revalidated = false
  }

  return NextResponse.json({ ...result, ok: true, revalidated })
}
