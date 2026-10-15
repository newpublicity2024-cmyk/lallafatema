import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import type { Post, User } from '@/payload-types'

/**
 * The `/publish-due` endpoint — what makes a programmed article PUNCTUAL (cache) and
 * SEARCHABLE (index) at its moment.
 *
 * Exercised as a real route handler with a real `NextRequest` against the real database.
 * Only the two side effects are mocked, because they are the observables: `revalidatePath`
 * cannot run outside a request scope, and `indexPost` would otherwise need a live
 * Meilisearch. Both are asserted to have been CALLED, with the right argument — not merely
 * "the route returned 200".
 *
 * SHARED-DATABASE DISCIPLINE: the database is shared with PRODUCTION, so the one fixture
 * this file creates is published with a FUTURE date, which the site's own rule keeps
 * invisible to everyone but its author. Nothing here ever creates an article a reader could
 * open — the "already fell due" case is observed on articles that are legitimately live.
 * The fixture carries the run marker and is deleted in `afterAll`.
 */

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('@/lib/search', () => ({
  indexPost: vi.fn(async () => {}),
  removePost: vi.fn(async () => {}),
  searchEnabled: () => false,
}))

const SECRET = 'test-publish-due-secret'
const CRON = 'test-publish-due-cron'

let payload: Payload
let journalist: User
let newsCategory: number

const RUN = `DUE${Date.now().toString(36).toUpperCase()}`
const EMAIL = `${RUN.toLowerCase()}-journalist@payloadcms.com`
const created: number[] = []

const body = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'rtl' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'rtl' as const,
        children: [
          { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})

async function publishAt(at: Date, label: string): Promise<Post> {
  const post = (await payload.create({
    collection: 'posts',
    data: {
      title: `${RUN} ${label}`,
      category: newsCategory,
      content: body('نص مقال مبرمج.'),
      publishedAt: at.toISOString(),
      _status: 'published',
    } as never,
    user: journalist as never,
    overrideAccess: false,
  })) as Post
  created.push(post.id as number)
  return post
}

/**
 * Calls the route the way a caller really would, through a real NextRequest.
 *
 * The spies are cleared HERE, immediately before the handler runs, and deliberately not in
 * a `beforeEach`. Creating a fixture is itself a publish, so `Posts`' own
 * `searchIndexAfterChange` hook calls the very `indexPost` these tests spy on — clearing
 * earlier left those calls in the record and made "the route indexed this article"
 * unfalsifiable. (Found exactly that way: the not-yet-due article appeared in the spy
 * while correctly absent from the route's own answer.)
 */
async function call(query: string, headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/(frontend)/publish-due/route')
  const { NextRequest } = await import('next/server')
  const { revalidatePath, indexPost } = await spies()
  revalidatePath.mockClear()
  indexPost.mockClear()

  const req = new NextRequest(`https://lallafatema.test/publish-due${query}`, { headers })
  const res = await GET(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function spies() {
  const cache = (await import('next/cache')) as unknown as {
    revalidatePath: ReturnType<typeof vi.fn>
  }
  const search = (await import('@/lib/search')) as unknown as {
    indexPost: ReturnType<typeof vi.fn>
  }
  return { revalidatePath: cache.revalidatePath, indexPost: search.indexPost }
}

beforeAll(async () => {
  process.env.REVALIDATE_SECRET = SECRET
  process.env.CRON_SECRET = CRON

  payload = await getPayload({ config: await (await import('@/payload.config')).default })

  await payload.delete({ collection: 'users', where: { email: { equals: EMAIL } } })
  journalist = (await payload.create({
    collection: 'users',
    data: { email: EMAIL, password: 'test', name: `${RUN} صحفي`, role: 'journalist' } as never,
  })) as User

  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: 'news' } },
    limit: 1,
  })
  if (!docs[0]) throw new Error('fixture precondition failed: no "news" category in the database')
  newsCategory = docs[0].id as number
}, 120000)

afterAll(async () => {
  await payload.delete({ collection: 'posts', where: { title: { like: RUN } } }).catch(() => {})
  await payload.delete({ collection: 'users', where: { email: { equals: EMAIL } } }).catch(() => {})
  for (const id of created) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
  created.length = 0
}, 300000)

describe('/publish-due authorisation', () => {
  it('refuses a caller with no secret', async () => {
    const { status, json } = await call('')
    expect(status).toBe(401)
    expect(json.ok).toBe(false)
  })

  it('refuses a wrong secret, a prefix of the secret, and a wrong bearer token', async () => {
    // A route that revalidates the whole site and writes to the search index must not be
    // open. The prefix case guards the length check in `secretMatches`.
    for (const q of [`?secret=nope`, `?secret=${SECRET.slice(0, -1)}`, `?secret=${SECRET}x`]) {
      expect((await call(q)).status, `${q} was accepted`).toBe(401)
    }
    expect((await call('', { authorization: `Bearer ${CRON}x` })).status).toBe(401)
  })

  it('does not act when it refuses', async () => {
    const { revalidatePath, indexPost } = await spies()
    await call('?secret=nope')
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(indexPost).not.toHaveBeenCalled()
  })

  it('accepts the query secret and the Vercel cron bearer token', async () => {
    expect((await call(`?secret=${SECRET}`)).status).toBe(200)
    expect((await call('', { authorization: `Bearer ${CRON}` })).status).toBe(200)
  }, 60000)
})

describe('/publish-due behaviour', () => {
  it('revalidates and indexes the articles that have fallen due', async () => {
    const { revalidatePath, indexPost } = await spies()

    /*
     * Measured on articles that are ALREADY LIVE, with a window wide enough to reach them,
     * instead of creating one that has just fallen due.
     *
     * An earlier version of this test created a fixture dated two minutes in the past. That
     * is, by definition, a published article on a database shared with production — and one
     * duly appeared on the real homepage. "Due in the last N minutes" cannot be fabricated
     * without publishing something, so it is observed on the corpus instead. The side
     * effects are what this test is really about, and they are identical either way.
     */
    const { json } = await call(`?secret=${SECRET}&minutes=${60 * 24 * 7}`)
    const ids = json.ids as number[]

    expect(ids.length, 'no live article fell inside a one-week window — cannot test the effects')
      .toBeGreaterThan(0)
    expect(json.revalidated).toBe(true)
    // The whole frontend, exactly as every publish already does — this is what collapses
    // the ISR window (and the cached 404 on the article URL) to seconds.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    // ...and the search-index gap: nothing else would ever index a newly-due article,
    // because `indexPost` otherwise runs only from a save hook. One call per due article.
    const indexed = indexPost.mock.calls.flat()
    for (const id of ids) {
      expect(indexed, `due article ${id} was not sent to the search index`).toContain(id)
    }
  }, 120000)

  it('leaves an article that is not yet due alone', async () => {
    const { indexPost } = await spies()
    const future = await publishAt(new Date(Date.now() + 48 * 3_600_000), 'لم يستحق')
    const id = future.id as number

    const { json } = await call(`?secret=${SECRET}&minutes=15`)

    expect(json.ids as number[]).not.toContain(id)
    expect(indexPost.mock.calls.flat()).not.toContain(id)
  }, 90000)

  it('touches nothing when nothing fell due', async () => {
    const { revalidatePath, indexPost } = await spies()

    /*
     * Asserted as the INVARIANT `revalidated === (due > 0)` rather than as "due is 0".
     * This runs against a live magazine's database: a real article could legitimately fall
     * due during the window, and a test that demanded an empty result would then fail for
     * the wrong reason. The invariant is the actual contract — never revalidate for
     * nothing, which is what would otherwise throw away the ISR cache on every cron tick —
     * and it is checkable whatever the corpus contains.
     */
    const { json } = await call(`?secret=${SECRET}&minutes=1`)
    const due = json.due as number

    expect(json.revalidated).toBe(due > 0)
    expect(revalidatePath.mock.calls.length > 0).toBe(due > 0)
    expect(indexPost.mock.calls.length).toBe(due)
  }, 60000)

  it('reports the window it actually used', async () => {
    // The resolution POLICY (junk, zero, absurd values) is asserted exhaustively and
    // instantly in schedule.int.spec.ts — `resolveWindowMinutes` is a pure function. What
    // can only be checked here is that the route is wired to it and reports what it used,
    // which is how an operator running a catch-up by hand knows how far back it reached.
    const { json } = await call(`?secret=${SECRET}&minutes=7`)
    expect(json.minutes).toBe(7)
  }, 60000)
})
