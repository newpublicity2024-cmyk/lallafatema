import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { LALLA_FATEMA_CHANNEL_ID } from '@/lib/youtube'

/**
 * The `/sync-youtube` endpoint — the thing that makes "anything new on the channel appears
 * on the website" true without anybody touching the admin.
 *
 * Exercised as a real route handler with a real `NextRequest`. Two collaborators are
 * mocked, and only two, because they are the observables:
 *
 *   - `revalidatePath` cannot run outside a request scope, and asserting it was called
 *     (and NOT called on a quiet tick) is the whole point of the conditional-revalidation
 *     design.
 *   - `runChannelSync` is mocked so the endpoint's own logic — authorisation, the channel
 *     override, the change/no-change branch, failure handling — is tested without the
 *     network and without writing to a production-shared database. The sync itself is
 *     covered against the real database in `youtube-sync.int.spec.ts`.
 *
 * Authorisation is asserted here AND in `publish-due.int.spec.ts` because both endpoints
 * now share `src/lib/cron-auth.ts`; two independent callers of one security primitive is
 * the point of extracting it.
 */

const CRON = 'test-sync-cron-secret'
const MANUAL = 'test-sync-manual-secret'

const revalidatePath = vi.fn()
const runChannelSync = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('@/lib/youtube-sync', () => ({
  runChannelSync: (...args: unknown[]) => runChannelSync(...args),
  syncChannelVideos: vi.fn(),
}))

const okResult = (changed: number) => ({
  channelId: LALLA_FATEMA_CHANNEL_ID,
  source: 'rss' as const,
  fetched: 15,
  created: changed,
  updated: 0,
  unchanged: 15 - changed,
  changed,
})

let GET: (req: NextRequest) => Promise<Response>
let payload: Payload
const originalCron = process.env.CRON_SECRET
const originalManual = process.env.REVALIDATE_SECRET

const request = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(new Request(`https://lallafatema.ma${url}`, { headers }))

beforeAll(async () => {
  process.env.CRON_SECRET = CRON
  process.env.REVALIDATE_SECRET = MANUAL
  // Imported after the env is set and the mocks are registered.
  ;({ GET } = await import('@/app/(frontend)/sync-youtube/route'))
  payload = await getPayload({ config: await config })
  expect(payload).toBeTruthy()
}, 60000)

afterAll(() => {
  if (originalCron === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCron
  if (originalManual === undefined) delete process.env.REVALIDATE_SECRET
  else process.env.REVALIDATE_SECRET = originalManual
})

beforeEach(() => {
  revalidatePath.mockClear()
  runChannelSync.mockReset()
  runChannelSync.mockResolvedValue(okResult(0))
})

describe('/sync-youtube — authorisation', () => {
  it.each([
    ['no credential at all', '/sync-youtube', {}],
    ['a wrong bearer', '/sync-youtube', { authorization: 'Bearer nope' }],
    ['a wrong query secret', '/sync-youtube?secret=nope', {}],
    ['the manual secret sent as a bearer', '/sync-youtube', { authorization: `Bearer ${MANUAL}` }],
    ['the cron secret sent as a query param', `/sync-youtube?secret=${CRON}`, {}],
  ])('rejects %s with 401', async (_label, url, headers) => {
    const response = await GET(request(url, headers))
    expect(response.status).toBe(401)
    expect(runChannelSync).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('accepts the Vercel cron bearer', async () => {
    const response = await GET(request('/sync-youtube', { authorization: `Bearer ${CRON}` }))
    expect(response.status).toBe(200)
    expect(runChannelSync).toHaveBeenCalledTimes(1)
  })

  it('accepts the manual revalidate secret', async () => {
    const response = await GET(request(`/sync-youtube?secret=${MANUAL}`))
    expect(response.status).toBe(200)
    expect(runChannelSync).toHaveBeenCalledTimes(1)
  })

  it('is inert when no secret is configured at all', async () => {
    delete process.env.CRON_SECRET
    delete process.env.REVALIDATE_SECRET
    try {
      expect((await GET(request('/sync-youtube'))).status).toBe(401)
      expect((await GET(request('/sync-youtube?secret='))).status).toBe(401)
      expect(
        (await GET(request('/sync-youtube', { authorization: 'Bearer ' }))).status,
      ).toBe(401)
    } finally {
      process.env.CRON_SECRET = CRON
      process.env.REVALIDATE_SECRET = MANUAL
    }
  })
})

describe('/sync-youtube — behaviour', () => {
  const authorized = () => request('/sync-youtube', { authorization: `Bearer ${CRON}` })

  it('purges the page cache when the sync changed something', async () => {
    runChannelSync.mockResolvedValue(okResult(3))

    const response = await GET(authorized())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, created: 3, changed: 3, revalidated: true })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('leaves the cache alone on a quiet tick', async () => {
    runChannelSync.mockResolvedValue(okResult(0))

    const body = await (await GET(authorized())).json()

    expect(body).toMatchObject({ ok: true, changed: 0, revalidated: false })
    // 48 ticks a day against a channel that posts a few times: revalidating regardless
    // would throw away the ISR cache the whole site depends on.
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('syncs the configured channel by default', async () => {
    await GET(authorized())
    expect(runChannelSync).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: LALLA_FATEMA_CHANNEL_ID }),
    )
  })

  it('honours a valid ?channel= override', async () => {
    await GET(
      request('/sync-youtube?channel=UCaaaaaaaaaaaaaaaaaaaaaa', {
        authorization: `Bearer ${CRON}`,
      }),
    )
    expect(runChannelSync).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }),
    )
  })

  it.each([
    ['a traversal', '../../etc/passwd'],
    ['a foreign host URL', 'https://evil.example/channel/UCaaaaaaaaaaaaaaaaaaaaaa'],
    ['markup', '<script>alert(1)</script>'],
    ['an empty value', ''],
  ])('ignores %s in ?channel= and falls back to the configured channel', async (_l, value) => {
    await GET(
      request(`/sync-youtube?channel=${encodeURIComponent(value)}`, {
        authorization: `Bearer ${CRON}`,
      }),
    )
    expect(runChannelSync).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: LALLA_FATEMA_CHANNEL_ID }),
    )
  })

  it('answers 500 rather than throwing when the sync fails', async () => {
    runChannelSync.mockRejectedValue(new Error('upstream exploded'))

    const response = await GET(authorized())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
