import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import type { Post, User } from '@/payload-types'

/**
 * Scheduled publishing, end to end on the REAL stack: a real journalist account, a real
 * create through the collection's registered hooks, real rows in Postgres, and reads taken
 * the way each surface really takes them.
 *
 * Why this file exists alongside `schedule.int.spec.ts`: that one proves the rules are
 * right, and every one of its assertions would keep passing if the field were never
 * exposed to a journalist or the dashboard never used the rules. This one proves a
 * journalist's scheduled article actually behaves — invisible to the public, visible to its
 * author, listed as programmed — and then proves the SAME document goes live once its
 * moment passes, so none of the "invisible" assertions can be passing because the fixture
 * is simply broken.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE NOW OBEYS: never leave a post the PUBLIC can read.
 *
 * The database is a Neon instance that dev and PRODUCTION share, and lallafatema.ma is a
 * live magazine. An earlier draft of this file created a fixture dated two minutes in the
 * past — which is, by definition, a published article — and it appeared on the real
 * homepage, where Next's ISR then cached it for the better part of an hour. Deleting the
 * row did not remove it from the site; the cached HTML had to be purged separately.
 *
 * So every fixture here is published with a FUTURE date, which the site's own rule makes
 * invisible to everyone but its author. Where a test needs to observe a post the public CAN
 * read, it uses an article that is ALREADY LIVE on the site, read-only, instead of creating
 * one. The single test that must observe the transition does it with an exposure measured
 * in seconds and reverts in a `finally` — see its comment.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ONE FIXTURE, CREATED ONCE. Every write here is a round trip to a remote Neon instance; a
 * create with versions enabled costs 8–25 seconds on it. An earlier draft created a post per
 * test (seven in all) and a 570-second run ended in `Connection terminated unexpectedly` —
 * Neon dropped the pooled connection mid-test and a gate that had passed minutes earlier
 * failed. A gate whose verdict moves between runs is not evidence, so the suite now creates
 * one document in `beforeAll` and the tests are overwhelmingly reads.
 *
 * SHARED-DATABASE DISCIPLINE (see publishing-chain.int.spec.ts): every document carries the
 * `RUN` marker, is tracked, and is deleted in `afterAll`. Nothing here reads-modify-writes
 * a document it did not create.
 */

// The afterChange hook calls revalidatePath, which is not available outside a request
// scope. Mocked for the same reason publishing-chain.int.spec.ts mocks it.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

let payload: Payload

const RUN = `SCHED${Date.now().toString(36).toUpperCase()}`
const JOURNALIST_EMAIL = `${RUN.toLowerCase()}-journalist@payloadcms.com`

let journalist: User
let newsCategory: number
const created: number[] = []

const HOUR = 3_600_000

/** 48h out: unambiguously future, and far from any window this suite uses. */
const SCHEDULED_AT = new Date(Date.now() + 48 * HOUR)

/** The programmed article — invisible to the public for its whole life here. */
let scheduled: Post

/**
 * An article that is ALREADY LIVE on the site, borrowed read-only as the control for every
 * "is anything visible at all" assertion. Using the real corpus instead of a fixture is
 * what keeps this suite from ever publishing anything.
 */
let liveControl: Post

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

/**
 * Publishes an article AS THE JOURNALIST, with `publishedAt` set to `at`.
 *
 * `overrideAccess: false` and `user` are the point: this goes through the journalist's own
 * access rules and the collection's real `beforeChange` chain, so it proves a journalist
 * can do this — not merely that the database can hold the row.
 */
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

/** What an anonymous visitor's Payload read returns for exactly this post. */
async function anonymouslyVisible(id: number): Promise<boolean> {
  const { totalDocs } = await payload.find({
    collection: 'posts',
    where: { id: { equals: id } },
    overrideAccess: false,
    limit: 1,
    depth: 0,
  })
  return totalDocs === 1
}

/** Whether a Where clause (built by the dashboard or the endpoint) selects exactly this post. */
async function selectedBy(where: object, id: number): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: 'posts',
    where: { and: [where, { id: { equals: id } }] } as never,
  })
  return totalDocs === 1
}

beforeAll(async () => {
  payload = await getPayload({ config: await (await import('@/payload.config')).default })

  await payload.delete({ collection: 'users', where: { email: { equals: JOURNALIST_EMAIL } } })
  journalist = (await payload.create({
    collection: 'users',
    data: {
      email: JOURNALIST_EMAIL,
      password: 'test',
      name: `${RUN} صحفي`,
      role: 'journalist',
    } as never,
  })) as User

  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: 'news' } },
    limit: 1,
  })
  if (!docs[0]) throw new Error('fixture precondition failed: no "news" category in the database')
  newsCategory = docs[0].id as number

  scheduled = await publishAt(SCHEDULED_AT, 'مقال مبرمج')

  // Borrow a genuinely live article as the visibility control. Read-only: this suite never
  // writes to it, and `afterAll` only ever deletes rows carrying this run's marker.
  const { publishedWhere } = await import('@/lib/published-where')
  const live = await payload.find({
    collection: 'posts',
    where: publishedWhere(),
    sort: '-publishedAt',
    limit: 1,
    depth: 0,
  })
  if (!live.docs[0]) {
    throw new Error('fixture precondition failed: no live article to use as the visibility control')
  }
  liveControl = live.docs[0] as Post
}, 300000)

afterAll(async () => {
  // Marker sweep first (one query), then the account — a stranded post is clutter, a
  // stranded account is access. Same ordering and reasoning as publishing-chain.
  await payload.delete({ collection: 'posts', where: { title: { like: RUN } } }).catch(() => {})
  await payload
    .delete({ collection: 'users', where: { email: { equals: JOURNALIST_EMAIL } } })
    .catch(() => {})
  for (const id of created) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
  created.length = 0
}, 300000)

describe('a journalist schedules an article', () => {
  it('stores the chosen moment, hides it from the public, and shows it to its author', async () => {
    const { getPostById, getPosts } = await import('@/lib/queries')
    const { publishedWhere } = await import('@/lib/published-where')
    const id = scheduled.id as number

    // 0. The date the journalist chose survived the hooks unchanged.
    //    `applyPostDefaults` stamps `publishedAt = now` on first publish ONLY when it is
    //    absent. If that guard ever broke, scheduling would silently become "publish now" —
    //    the single most damaging regression this feature could suffer.
    const stored = (await payload.findByID({ collection: 'posts', id, depth: 0 })) as Post
    expect(stored._status).toBe('published')
    expect(new Date(stored.publishedAt as string).toISOString()).toBe(SCHEDULED_AT.toISOString())

    // 1. The REST/GraphQL surface, through the registered `canReadPosts` access rule.
    expect(await anonymouslyVisible(id), 'a scheduled post answered an anonymous API read').toBe(
      false,
    )

    // 2. The article URL. `getPostById` is what the page calls; null is its 404.
    expect(await getPostById(id), 'the article page would have served a scheduled post').toBeNull()

    // 3. Public listings.
    const listed = await getPosts({ limit: 100 })
    expect(listed.docs.map((d) => d.id)).not.toContain(id)

    // 4. The sitemap's own query — the same predicate, asserted where search engines read.
    expect(await selectedBy(publishedWhere(), id), 'a scheduled post is in the sitemap').toBe(false)

    // 5. Its author, however, must still find their own work. This is the assertion that
    //    makes the four above meaningful rather than a fixture that failed to save.
    const own = await payload.find({
      collection: 'posts',
      where: { id: { equals: id } },
      user: journalist as never,
      overrideAccess: false,
      limit: 1,
      depth: 0,
    })
    expect(own.totalDocs, 'the journalist cannot see their own scheduled article').toBe(1)

    // 6. ...and a genuinely live article IS public, through the same two reads. Without
    //    this control the five assertions above could all be passing because nothing is
    //    visible to anyone. Borrowed from the real corpus rather than created, so this
    //    suite never puts an article on the site.
    const liveId = liveControl.id as number
    expect(
      await anonymouslyVisible(liveId),
      'the live control article is not public either — these assertions prove nothing',
    ).toBe(true)
    expect((await getPostById(liveId))?.id, 'the live control article does not serve').toBe(liveId)
  }, 120000)

  it('lists it as programmed, keeps it out of the published counts, and proves the old predicate did not', async () => {
    const { publishedWhere, scheduledWhere } = await import('@/components/admin/dashboard/shared')
    const id = scheduled.id as number

    expect(
      await selectedBy(scheduledWhere(journalist) as object, id),
      'the scheduled widget would not show the article',
    ).toBe(true)

    expect(
      await selectedBy(publishedWhere(journalist) as object, id),
      'the dashboard counts a scheduled article as published ("على الموقع الآن")',
    ).toBe(false)

    /*
     * POSITIVE CONTROL. The fix above is an ABSENCE, and an absence is satisfiable by a
     * query that selects nothing at all. So assert the PRE-CHANGE predicate — `_status`
     * alone, which is exactly what `publishedWhere` was before this feature — DID select
     * this post. That is the defect, demonstrated against the same row.
     */
    const beforeTheFix = {
      and: [{ _status: { equals: 'published' } }, { authors: { in: [journalist.id] } }],
    }
    expect(
      await selectedBy(beforeTheFix, id),
      'positive control failed: the old predicate did not select the scheduled post, so this ' +
        'test proves nothing about the fix',
    ).toBe(true)

    /*
     * The other side of the partition, so "excluded" above cannot be a query that excludes
     * everything. Measured on the EDITORIAL predicate against the live control article —
     * `publishedWhere(journalist)` is author-scoped and the control has a different byline,
     * so the unscoped editorial form is the one that can see it.
     */
    const editorialView = { ...journalist, role: 'editor' } as User
    expect(
      await selectedBy(publishedWhere(editorialView) as object, liveControl.id as number),
      'the published predicate selects nothing at all, so its exclusions mean nothing',
    ).toBe(true)
    expect(
      await selectedBy(scheduledWhere(editorialView) as object, liveControl.id as number),
    ).toBe(false)
  }, 120000)

  it('matches the window the due-check endpoint uses, and only when actually due', async () => {
    const { dueSinceWhere } = await import('@/lib/schedule')

    expect(
      await selectedBy(dueSinceWhere(15) as object, scheduled.id as number),
      'the cron would revalidate for an article that is not due yet',
    ).toBe(false)

    /*
     * The positive half is asserted on the real corpus rather than on a fixture, for the
     * same reason as the control above: a post that "fell due in the last N minutes" is a
     * published post, and creating one here is what put a test article on the live site.
     * A window wide enough to reach the newest live article proves the clause selects
     * things; the 15-minute window above proves it excludes what is not due.
     */
    const ageMinutes = Math.ceil(
      (Date.now() - new Date(liveControl.publishedAt as string).getTime()) / 60_000,
    )
    expect(
      await selectedBy(dueSinceWhere(ageMinutes + 1) as object, liveControl.id as number),
      'a window spanning the newest live article does not select it — the clause is inert',
    ).toBe(true)
  }, 120000)

  // MUTATES `scheduled`. Last, so the read-only tests above see it in its programmed state.
  it('goes live by itself once its moment passes, moving between both dashboard lists', async () => {
    const { getPostById } = await import('@/lib/queries')
    const { publishedWhere, scheduledWhere } = await import('@/components/admin/dashboard/shared')
    const id = scheduled.id as number

    /*
     * The NEGATIVE CONTROL for every "invisible" assertion in this file: the same document,
     * the same hooks, nothing changed but the clock. If "invisible" were an artefact of a
     * broken fixture, this would stay invisible and the gate would fail. It is the strongest
     * single piece of evidence for the feature, so it is kept — carefully.
     *
     * Three things bound the exposure, because for a few seconds this IS a live article on a
     * live magazine:
     *
     *   1. BACK-DATED BY YEARS, not minutes. Every listing on the site sorts `-publishedAt`
     *      and takes a limit, so a 2015 article cannot reach the homepage, a category page
     *      or the RSS feed — the surfaces a leak actually reaches. (A two-minute-old date is
     *      exactly what put a fixture on the homepage before.)
     *   2. DELETED IN `finally`, immediately after four fast count queries, so the window is
     *      seconds rather than the length of the run.
     *   3. NOTHING CACHES IT. `next/cache` is mocked in this file and no visitor knows the
     *      URL.
     *
     * The teardown DELETES rather than re-dating the post, for two reasons: it leaves no
     * residual exposure at all (re-dating leaves a published row alive until `afterAll`), and
     * it is one write instead of two. That second point is why this test timed out at 180s
     * on the previous run — every `payload.update` on a versioned collection costs 8–25
     * seconds against remote Neon, and the revert doubled the test's write cost for no
     * safety gain.
     */
    const LONG_AGO = new Date('2015-01-01T00:00:00.000Z').toISOString()
    try {
      await payload.update({
        collection: 'posts',
        id,
        data: { publishedAt: LONG_AGO } as never,
      })

      expect(await anonymouslyVisible(id), 'a due post is still hidden from the public').toBe(true)
      expect(
        (await getPostById(id))?.id,
        'the article page still 404s after the moment passed',
      ).toBe(id)
      expect(await selectedBy(scheduledWhere(journalist) as object, id)).toBe(false)
      expect(await selectedBy(publishedWhere(journalist) as object, id)).toBe(true)
    } finally {
      await payload.delete({ collection: 'posts', id }).catch(() => {})
    }
  }, 300000)
})
