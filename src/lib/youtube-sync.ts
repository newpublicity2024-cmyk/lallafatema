import type { Payload } from 'payload'

import { fetchChannelVideos } from '@/lib/youtube-source'
import { resolvedChannelId, type ChannelVideo, type ChannelVideoSource } from '@/lib/youtube'

/**
 * Upsert the channel's videos into the `youtube-videos` collection.
 *
 * THE THREE PROPERTIES THIS HAS TO HAVE, because it runs unattended forever:
 *
 *   1. **Idempotent.** `videoId` is the key and it is unique in the schema, so the
 *      thousandth run of an unchanged channel is a no-op. Without this a cron silently
 *      duplicates the band every half hour.
 *   2. **Non-destructive to editor intent.** `hidden` is the only field a human owns, and
 *      it is never included in an update. An editor who hides an off-brand upload keeps it
 *      hidden through every subsequent sync.
 *   3. **Honest about change.** `changed` counts rows that actually differ. The endpoint
 *      revalidates the page cache only when it is non-zero, so a quiet channel costs one
 *      cheap read per tick instead of throwing away the whole ISR cache 48 times a day.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: delete. A video missing from this run's payload is
 * left alone. The RSS feed is a 15-item window, so "absent from the feed" overwhelmingly
 * means "older than the window", not "deleted from the channel" — and a sync that pruned
 * on absence would wipe the archive the first time it ran against RSS after an API run.
 * Removing a video from the site is `hidden`, or a delete in the admin.
 */

export type SyncResult = {
  channelId: string
  source: ChannelVideoSource
  /** Videos returned by the source. */
  fetched: number
  created: number
  updated: number
  unchanged: number
  /** `created + updated` — the signal the endpoint uses to decide on revalidation. */
  changed: number
  /** Non-fatal note, e.g. the Data API fell back to RSS. */
  warning?: string
}

/** The synced (non-editor-owned) half of a row. Exactly what an update may overwrite. */
type SyncedFields = {
  title: string
  description: string | null
  publishedAt: string
  thumbnailUrl: string
  isShort: boolean
  views: number | null
  durationSeconds: number | null
  channelId: string
}

const syncedFieldsOf = (video: ChannelVideo, channelId: string): SyncedFields => ({
  title: video.title,
  description: video.description,
  publishedAt: video.publishedAt,
  thumbnailUrl: video.thumbnailUrl,
  isShort: video.isShort,
  views: video.views,
  durationSeconds: video.durationSeconds,
  channelId,
})

/** Normalise a stored value for comparison, so `null`/`undefined`/`''` do not look different. */
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  // Dates round-trip through the database as Date or as an ISO string depending on driver.
  if (a instanceof Date || b instanceof Date) {
    const ta = new Date(a as string | Date).getTime()
    const tb = new Date(b as string | Date).getTime()
    return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b)
  return String(a) === String(b)
}

type ExistingRow = Record<string, unknown> & { id: number | string }

function needsUpdate(existing: ExistingRow, next: SyncedFields): boolean {
  return (Object.keys(next) as (keyof SyncedFields)[]).some(
    (key) => !same(existing[key], next[key]),
  )
}

/**
 * Write `videos` into the collection under `channelId`.
 *
 * Split out from {@link runChannelSync} so the fetch and the write can be exercised
 * separately: every test and gate that needs a deterministic payload calls this directly
 * and never touches the network.
 */
export async function syncChannelVideos({
  payload,
  channelId,
  videos,
  source,
  warning,
}: {
  payload: Payload
  channelId: string
  videos: ChannelVideo[]
  source: ChannelVideoSource
  warning?: string
}): Promise<SyncResult> {
  const result: SyncResult = {
    channelId,
    source,
    fetched: videos.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    changed: 0,
    ...(warning ? { warning } : {}),
  }

  if (videos.length === 0) return result

  // One read for the whole batch rather than a findByID per video: a cron tick should be
  // two queries plus the writes that are genuinely needed, not 2N round trips to Neon.
  const ids = videos.map((v) => v.videoId)
  const { docs: existingDocs } = await payload.find({
    collection: 'youtube-videos',
    where: { videoId: { in: ids } },
    limit: ids.length,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const existing = new Map<string, ExistingRow>(
    (existingDocs as unknown as ExistingRow[]).map((doc) => [String(doc.videoId), doc]),
  )

  const syncedAt = new Date().toISOString()

  for (const video of videos) {
    const next = syncedFieldsOf(video, channelId)
    const row = existing.get(video.videoId)

    if (!row) {
      try {
        await payload.create({
          collection: 'youtube-videos',
          data: { videoId: video.videoId, ...next, hidden: false, syncedAt },
          overrideAccess: true,
        })
        result.created++
      } catch (error) {
        // A unique-constraint violation here means a concurrent tick won the race — which
        // is a correct outcome, not a failure. Anything else is worth surfacing, but one
        // bad video must never abort the rest of the batch.
        if (!isDuplicateKey(error)) {
          payload.logger?.error?.(
            { err: error, videoId: video.videoId },
            'youtube sync: failed to create video',
          )
        }
      }
      continue
    }

    if (!needsUpdate(row, next)) {
      result.unchanged++
      continue
    }

    try {
      // `hidden` is absent from `next` by construction — that is the editor-owned field.
      await payload.update({
        collection: 'youtube-videos',
        id: row.id,
        data: { ...next, syncedAt },
        overrideAccess: true,
      })
      result.updated++
    } catch (error) {
      payload.logger?.error?.(
        { err: error, videoId: video.videoId },
        'youtube sync: failed to update video',
      )
    }
  }

  result.changed = result.created + result.updated
  return result
}

function isDuplicateKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /duplicate key|unique constraint|already exists/i.test(message)
}

/**
 * Fetch the channel and write it — the whole job, as the cron endpoint runs it.
 */
export async function runChannelSync({
  payload,
  channelId,
  fetchImpl,
}: {
  payload: Payload
  channelId?: string
  fetchImpl?: typeof fetch
}): Promise<SyncResult> {
  const id = channelId ?? resolvedChannelId()
  const fetched = await fetchChannelVideos({ channelId: id, fetchImpl })
  return syncChannelVideos({
    payload,
    channelId: fetched.channelId,
    videos: fetched.videos,
    source: fetched.source,
    warning: fetched.warning,
  })
}
