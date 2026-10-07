import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import type { Post, User } from '@/payload-types'

/**
 * AUDIT PROBE SUITE — the article publishing chain, end to end.
 *
 * Every probe runs against the REAL Payload instance and the REAL database, so
 * what it reports is what an editor would experience. Probes assert on observable
 * state read back out of Postgres (or on the hook's observable side effect),
 * never merely on "nothing threw".
 *
 * This file AUDITS. It must never be weakened to make a link of the chain look
 * healthy: a failing probe is the finding.
 *
 * SHARED-DATABASE DISCIPLINE: dev and production share one Neon database. Every
 * document this suite creates carries the `RUN` marker in its title, is tracked
 * in `created`, and is deleted in `afterAll` (plus a marker sweep as a net). No
 * probe reads-modify-writes a document it did not create, and no probe publishes
 * or unpublishes a pre-existing post. Listing probes (PC14) only READ the live
 * corpus.
 */

// `revalidateSite` swallows every error from `revalidatePath` so seed scripts can
// run outside a request scope — which also means the hook firing is invisible from
// the outside. Mocking the module is the only way to observe it, and it is the
// genuine observable: the probe asserts the real production code path called
// `revalidatePath('/', 'layout')`, not that a wrapper returned without throwing.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

let payload: Payload

/** Marker shared by every document this run creates — used by the cleanup sweep. */
const RUN = `AUDITPC${Date.now().toString(36).toUpperCase()}`

const EDITOR_EMAIL = `${RUN.toLowerCase()}-editor@payloadcms.com`
const JOURNALIST_A_EMAIL = `${RUN.toLowerCase()}-journalist-a@payloadcms.com`
const JOURNALIST_B_EMAIL = `${RUN.toLowerCase()}-journalist-b@payloadcms.com`

let editor: User
let journalistA: User
let journalistB: User
let newsCategory: number

/** Post ids this suite created; emptied by `afterAll`. */
const created: number[] = []
const track = (id: number | string): number => {
  created.push(id as number)
  return id as number
}
const untrack = (id: number | string): void => {
  const i = created.indexOf(id as number)
  if (i >= 0) created.splice(i, 1)
}

/** A title that is unmistakably this run's fixture. */
const t = (probe: string, extra = ''): string =>
  `${RUN} ${probe} مقال تدقيق${extra ? ` ${extra}` : ''}`

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

/** A Lexical document with no children at all — what an untouched editor submits. */
const emptyBody = () => ({
  root: { type: 'root', format: '', indent: 0, version: 1, direction: 'rtl' as const, children: [] },
})

type Caught = { name: string; message: string; status?: number; blob: string }

/**
 * Runs `fn` and returns the error it threw, flattened. `blob` carries name +
 * message + `data` (Payload puts field validation messages under `data.errors`),
 * so a probe can assert on the message an editor would actually be shown.
 */
async function capture(fn: () => Promise<unknown>): Promise<Caught | null> {
  try {
    await fn()
    return null
  } catch (err) {
    const e = err as { name?: string; message?: string; status?: number; data?: unknown }
    return {
      name: e.name ?? '',
      message: e.message ?? String(err),
      status: e.status,
      blob: `${e.name ?? ''} ${e.message ?? ''} ${JSON.stringify(e.data ?? null)}`,
    }
  }
}

/** The revalidate spy, resolved through the mocked module. */
async function revalidateSpy() {
  const mod = (await import('next/cache')) as unknown as {
    revalidatePath: ReturnType<typeof vi.fn>
  }
  return mod.revalidatePath
}

/** Reads a post straight back out of the database with no relationship population. */
const read = (id: number | string, draft = false): Promise<Post> =>
  payload.findByID({ collection: 'posts', id, depth: 0, draft }) as Promise<Post>

/** What an anonymous visitor's Payload read returns for exactly this post. */
async function anonymouslyVisible(id: number | string): Promise<boolean> {
  const { totalDocs } = await payload.find({
    collection: 'posts',
    where: { id: { equals: id } },
    overrideAccess: false,
    limit: 1,
    depth: 0,
  })
  return totalDocs === 1
}

/** Creates a draft with the journalist form's three fields and tracks it. */
async function createDraft(
  user: User,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<Post> {
  const post = (await payload.create({
    collection: 'posts',
    data: { title, category: newsCategory, content: body('نص مقال التدقيق.'), ...extra } as never,
    draft: true,
    user: user as never,
    overrideAccess: false,
  })) as Post
  track(post.id)
  return post
}

beforeAll(async () => {
  payload = await getPayload({ config: await (await import('@/payload.config')).default })

  const seed = async (email: string, role: string, name: string): Promise<User> => {
    await payload.delete({ collection: 'users', where: { email: { equals: email } } })
    return (await payload.create({
      collection: 'users',
      data: { email, password: 'test', name, role } as never,
    })) as User
  }

  editor = await seed(EDITOR_EMAIL, 'editor', `${RUN} محرّر`)
  journalistA = await seed(JOURNALIST_A_EMAIL, 'journalist', `${RUN} صحفي أ`)
  journalistB = await seed(JOURNALIST_B_EMAIL, 'journalist', `${RUN} صحفي ب`)

  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: 'news' } },
    limit: 1,
  })
  if (!docs[0]) throw new Error('fixture precondition failed: no "news" category in the database')
  newsCategory = docs[0].id as number
}, 120000)

afterAll(async () => {
  // 1. Everything we tracked.
  for (const id of created) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
  created.length = 0
  // 2. Net: anything carrying this run's marker that escaped tracking. Scoped to
  //    the marker so a pre-existing post can never be caught by it.
  await payload
    .delete({ collection: 'posts', where: { title: { like: RUN } } })
    .catch(() => {})
  for (const email of [EDITOR_EMAIL, JOURNALIST_A_EMAIL, JOURNALIST_B_EMAIL]) {
    await payload.delete({ collection: 'users', where: { email: { equals: email } } }).catch(() => {})
  }
}, 120000)

describe('publishing chain', () => {
  it('[PC01] a journalist creates a draft and it is stored as an unpublished draft', async () => {
    const post = await createDraft(journalistA, t('PC01'))

    const stored = await read(post.id)
    expect(stored._status).toBe('draft')
    expect(stored.publishedAt ?? null).toBeNull()
    // Authorship defaulted to the creating journalist (applyPostDefaults).
    expect(stored.authors).toEqual([journalistA.id])
    expect(stored.title).toBe(t('PC01'))
    // A draft is not content yet: the public must not see it.
    expect(await anonymouslyVisible(post.id)).toBe(false)
    // The draft was versioned, and the version is a draft too.
    const versions = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: post.id } },
      limit: 50,
    })
    expect(versions.totalDocs).toBeGreaterThanOrEqual(1)
    expect(versions.docs.every((v) => v.version._status === 'draft')).toBe(true)
  }, 60000)

  it('[PC02] autosave updates a draft without publishing it', async () => {
    const post = await createDraft(journalistA, t('PC02'))
    const before = await read(post.id)

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { content: body('نص محدَّث بواسطة الحفظ التلقائي للتدقيق.') } as never,
      draft: true,
      autosave: true,
      user: journalistA as never,
      overrideAccess: false,
    })

    // The new text really landed...
    const after = await read(post.id, true)
    expect(JSON.stringify(after.content)).toContain('نص محدَّث بواسطة الحفظ التلقائي للتدقيق.')
    expect(JSON.stringify(after.content)).not.toBe(JSON.stringify(before.content))
    // ...and the autosave did NOT publish the article behind the writer's back.
    expect(after._status).toBe('draft')
    expect(after.publishedAt ?? null).toBeNull()
    expect(await anonymouslyVisible(post.id)).toBe(false)
    // The write was recorded as an autosave, not as a deliberate save.
    const versions = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: post.id } },
      limit: 100,
      sort: '-updatedAt',
    })
    const autosaved = versions.docs.filter(
      (v) => (v as unknown as { autosave?: boolean }).autosave === true,
    )
    expect(autosaved.length).toBeGreaterThanOrEqual(1)

    // The consequential half of this link: autosaving over an article that is
    // ALREADY live must not push the unreviewed text to the public. Autosave
    // fires every ~375ms while a writer types, so if it wrote through to the
    // published row, every keystroke on a correction would be live instantly.
    const live = await createDraft(journalistA, t('PC02', 'منشور'), {
      content: body('النص المنشور المعتمد للجمهور.'),
    })
    await payload.update({
      collection: 'posts',
      id: live.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect(JSON.stringify((await read(live.id)).content)).toContain('النص المنشور المعتمد للجمهور.')

    await payload.update({
      collection: 'posts',
      id: live.id,
      data: { content: body('نص غير مراجَع كتبه الصحفي الآن.') } as never,
      draft: true,
      autosave: true,
      user: journalistA as never,
      overrideAccess: false,
    })

    const published = await read(live.id)
    expect(published._status).toBe('published')
    expect(JSON.stringify(published.content)).toContain('النص المنشور المعتمد للجمهور.')
    expect(JSON.stringify(published.content)).not.toContain('نص غير مراجَع كتبه الصحفي الآن.')
    // ...while the draft the writer is editing does hold the new text.
    expect(JSON.stringify((await read(live.id, true)).content)).toContain(
      'نص غير مراجَع كتبه الصحفي الآن.',
    )
  }, 60000)

  it('[PC03] refuses a journalist publish with 403', async () => {
    // (a) Publishing straight from create.
    const createTitle = t('PC03', 'إنشاء')
    const onCreate = await capture(() =>
      payload.create({
        collection: 'posts',
        data: {
          title: createTitle,
          category: newsCategory,
          content: body('نص.'),
          _status: 'published',
        } as never,
        user: journalistA as never,
        overrideAccess: false,
      }),
    )
    expect(onCreate).not.toBeNull()
    expect(onCreate?.status).toBe(403)
    expect(onCreate?.message).toMatch(/غير مسموح/)
    // The refusal must also leave nothing behind.
    const leaked = await payload.find({
      collection: 'posts',
      where: { title: { equals: createTitle } },
      limit: 1,
      depth: 0,
    })
    expect(leaked.totalDocs).toBe(0)

    // (b) Promoting their OWN draft — the path they can actually reach.
    const own = await createDraft(journalistA, t('PC03', 'ترقية'))
    const onUpdate = await capture(() =>
      payload.update({
        collection: 'posts',
        id: own.id,
        data: { _status: 'published' } as never,
        user: journalistA as never,
        overrideAccess: false,
      }),
    )
    expect(onUpdate).not.toBeNull()
    expect(onUpdate?.status).toBe(403)
    expect(onUpdate?.message).toMatch(/غير مسموح/)
    // And the document is still a draft and still invisible.
    const stored = await read(own.id)
    expect(stored._status).toBe('draft')
    expect(await anonymouslyVisible(own.id)).toBe(false)

    // (c) The back door: version history. A story the editor published and then
    //     pulled still has a `published` version in its history, and restoring a
    //     version is an update a journalist has access to. The 403 must hold on
    //     that path too, or the publish gate is cosmetic.
    const pulled = await createDraft(journalistA, t('PC03', 'مسترجع'))
    await payload.update({
      collection: 'posts',
      id: pulled.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'posts',
      id: pulled.id,
      data: { _status: 'draft' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(pulled.id))._status).toBe('draft')

    const history = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: pulled.id } },
      limit: 100,
      sort: '-updatedAt',
    })
    const publishedVersion = history.docs.find((v) => v.version._status === 'published')
    expect(publishedVersion).toBeTruthy()

    const onRestore = await capture(() =>
      payload.restoreVersion({
        collection: 'posts',
        id: String(publishedVersion?.id),
        user: journalistA as never,
        overrideAccess: false,
      }),
    )
    expect(onRestore).not.toBeNull()
    expect(onRestore?.status).toBe(403)
    expect((await read(pulled.id))._status).toBe('draft')
    expect(await anonymouslyVisible(pulled.id)).toBe(false)
  }, 60000)

  it('[PC04] an editor publishes a draft and the public can read it', async () => {
    const post = await createDraft(journalistA, t('PC04'))
    expect(await anonymouslyVisible(post.id)).toBe(false)

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })

    const stored = await read(post.id)
    expect(stored._status).toBe('published')
    expect(await anonymouslyVisible(post.id)).toBe(true)
    // The real public accessor, not just a raw find.
    const { getPostById } = await import('@/lib/queries')
    const viaSite = await getPostById(post.id as number)
    expect(viaSite?.id).toBe(post.id)
  }, 60000)

  it('[PC05] publishedAt is stamped on first publish and not moved on re-publish', async () => {
    const post = await createDraft(journalistA, t('PC05'))
    expect((await read(post.id)).publishedAt ?? null).toBeNull()

    const beforePublish = Date.now()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    const first = (await read(post.id)).publishedAt
    expect(first).toBeTruthy()
    const stampedAt = new Date(first as string).getTime()
    expect(stampedAt).toBeGreaterThanOrEqual(beforePublish - 60_000)
    expect(stampedAt).toBeLessThanOrEqual(Date.now() + 60_000)

    // (a) Editing and re-publishing must not re-date the article.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: t('PC05', 'منقّح'), _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(post.id)).publishedAt).toBe(first)

    // (b) Nor must the unpublish → publish round trip, which is how an editor
    //     pulls a story back and pushes it out again.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'draft' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(post.id)).publishedAt).toBe(first)

    // (c) An editor who sets the date deliberately owns it — the stamp must only
    //     fill a blank, never overwrite a chosen back-date (archive imports and
    //     corrections depend on this).
    const backDated = new Date('2024-03-05T09:30:00.000Z').toISOString()
    const second = await createDraft(journalistA, t('PC05', 'بتاريخ سابق'))
    await payload.update({
      collection: 'posts',
      id: second.id,
      data: { _status: 'published', publishedAt: backDated } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect(new Date((await read(second.id)).publishedAt as string).toISOString()).toBe(backDated)
  }, 60000)

  it('[PC06] publishing an empty article is rejected by validation', async () => {
    // (a) No body at all.
    const bodyless = (await payload.create({
      collection: 'posts',
      data: { title: t('PC06', 'بلا نص'), category: newsCategory } as never,
      draft: true,
      user: editor as never,
      overrideAccess: false,
    })) as Post
    track(bodyless.id)

    const refusedA = await capture(() =>
      payload.update({
        collection: 'posts',
        id: bodyless.id,
        data: { _status: 'published' } as never,
        user: editor as never,
        overrideAccess: false,
      }),
    )
    expect(refusedA).not.toBeNull()
    expect(refusedA?.blob).toMatch(/لا يمكن نشر مقال فارغ/)
    expect((await read(bodyless.id))._status).toBe('draft')
    expect(await anonymouslyVisible(bodyless.id)).toBe(false)

    // (b) A body that exists but holds nothing but whitespace.
    const blank = (await payload.create({
      collection: 'posts',
      data: {
        title: t('PC06', 'نص فارغ'),
        category: newsCategory,
        content: emptyBody(),
      } as never,
      draft: true,
      user: editor as never,
      overrideAccess: false,
    })) as Post
    track(blank.id)

    const refusedB = await capture(() =>
      payload.update({
        collection: 'posts',
        id: blank.id,
        data: { content: body('   '), _status: 'published' } as never,
        user: editor as never,
        overrideAccess: false,
      }),
    )
    expect(refusedB).not.toBeNull()
    expect(refusedB?.blob).toMatch(/لا يمكن نشر مقال فارغ/)
    expect((await read(blank.id))._status).toBe('draft')

    // (c) The one-shot path: an editor who writes nothing and hits publish on a
    //     brand-new article must be stopped before a blank page goes live.
    const oneShotTitle = t('PC06', 'إنشاء ونشر')
    const refusedC = await capture(() =>
      payload.create({
        collection: 'posts',
        data: {
          title: oneShotTitle,
          category: newsCategory,
          content: emptyBody(),
          _status: 'published',
        } as never,
        user: editor as never,
        overrideAccess: false,
      }),
    )
    expect(refusedC).not.toBeNull()
    expect(refusedC?.blob).toMatch(/لا يمكن نشر مقال فارغ/)
    const notCreated = await payload.find({
      collection: 'posts',
      where: { title: { equals: oneShotTitle } },
      limit: 1,
      depth: 0,
    })
    expect(notCreated.totalDocs).toBe(0)

    // (d) Control: the same publish succeeds the moment real text is present, so
    //     this probe cannot pass just because publishing is broken generally.
    await payload.update({
      collection: 'posts',
      id: blank.id,
      data: { content: body('نص حقيقي يسمح بالنشر.'), _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(blank.id))._status).toBe('published')
  }, 60000)

  it('[PC07] a draft is invisible to anonymous read', async () => {
    const draft = await createDraft(journalistA, t('PC07', 'مسودة'))
    const live = await createDraft(journalistA, t('PC07', 'منشور'))
    await payload.update({
      collection: 'posts',
      id: live.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })

    // Anonymous list read: the published sibling proves the query is not simply
    // returning nothing.
    const { docs } = await payload.find({
      collection: 'posts',
      where: { id: { in: [draft.id, live.id] } },
      overrideAccess: false,
      limit: 10,
      depth: 0,
    })
    const ids = docs.map((d) => d.id)
    expect(ids).toContain(live.id)
    expect(ids).not.toContain(draft.id)

    // Anonymous single-document read is refused outright.
    const byId = await capture(() =>
      payload.findByID({ collection: 'posts', id: draft.id, overrideAccess: false, depth: 0 }),
    )
    expect(byId).not.toBeNull()
    // Denied, not merely "errored" — a stray TypeError must not count as privacy.
    expect([403, 404]).toContain(byId?.status)

    // And the site's own accessor returns nothing for it.
    const { getPostById, getPosts } = await import('@/lib/queries')
    expect(await getPostById(draft.id as number)).toBeNull()
    const listing = await getPosts({ limit: 100 })
    expect(listing.docs.map((d) => d.id)).not.toContain(draft.id)
  }, 60000)

  it('[PC08] a journalist can read their own draft but not another journalist draft', async () => {
    const mine = await createDraft(journalistA, t('PC08', 'لي'))
    const theirs = await createDraft(journalistB, t('PC08', 'لغيري'))
    expect((await read(theirs.id)).authors).toEqual([journalistB.id])

    const asA = await payload.find({
      collection: 'posts',
      where: { id: { in: [mine.id, theirs.id] } },
      overrideAccess: false,
      user: journalistA as never,
      limit: 10,
      depth: 0,
    })
    const visibleToA = asA.docs.map((d) => d.id)
    expect(visibleToA).toContain(mine.id)
    expect(visibleToA).not.toContain(theirs.id)

    // Direct fetch of the other journalist's draft is refused.
    const peek = await capture(() =>
      payload.findByID({
        collection: 'posts',
        id: theirs.id,
        overrideAccess: false,
        user: journalistA as never,
        depth: 0,
      }),
    )
    expect(peek).not.toBeNull()
    expect([403, 404]).toContain(peek?.status)

    // Symmetry: B sees theirs and not mine (so the result above is ownership,
    // not an accident of ordering or of A being privileged).
    const asB = await payload.find({
      collection: 'posts',
      where: { id: { in: [mine.id, theirs.id] } },
      overrideAccess: false,
      user: journalistB as never,
      limit: 10,
      depth: 0,
    })
    const visibleToB = asB.docs.map((d) => d.id)
    expect(visibleToB).toContain(theirs.id)
    expect(visibleToB).not.toContain(mine.id)

    // And a journalist cannot edit someone else's draft either.
    const tamper = await capture(() =>
      payload.update({
        collection: 'posts',
        id: theirs.id,
        data: { title: t('PC08', 'عبث') } as never,
        user: journalistA as never,
        overrideAccess: false,
      }),
    )
    expect(tamper).not.toBeNull()
    expect([403, 404]).toContain(tamper?.status)
    expect((await read(theirs.id)).title).toBe(t('PC08', 'لغيري'))
  }, 60000)

  it('[PC09] unpublishing removes the post from public reads', async () => {
    const post = await createDraft(journalistA, t('PC09'))
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect(await anonymouslyVisible(post.id)).toBe(true)

    const { getPostById, getPosts } = await import('@/lib/queries')
    expect((await getPosts({ limit: 100 })).docs.map((d) => d.id)).toContain(post.id)

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'draft' } as never,
      user: editor as never,
      overrideAccess: false,
    })

    expect((await read(post.id))._status).toBe('draft')
    expect(await anonymouslyVisible(post.id)).toBe(false)
    expect(await getPostById(post.id as number)).toBeNull()
    expect((await getPosts({ limit: 100 })).docs.map((d) => d.id)).not.toContain(post.id)
    // The editor must still be able to find it to work on it.
    const editorial = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      overrideAccess: false,
      user: editor as never,
      limit: 1,
      depth: 0,
    })
    expect(editorial.totalDocs).toBe(1)
  }, 60000)

  it('[PC10] slug is generated and stays unique', async () => {
    const sharedTitle = t('PC10', 'عنوان مكرر')
    const first = await createDraft(journalistA, sharedTitle)
    const firstSlug = (await read(first.id)).slug
    // Generated from the Arabic title, Arabic script preserved.
    expect(firstSlug).toBe(
      sharedTitle.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, ''),
    )

    // A second article with the SAME title must not end up on the same slug —
    // a slug is an identifier, and two articles sharing one is a collision.
    const second = await createDraft(journalistA, sharedTitle)
    const secondSlug = (await read(second.id)).slug
    expect(secondSlug).toBeTruthy()
    expect(secondSlug).not.toBe(firstSlug)

    // Nor may a slug be hand-set to one that is already taken.
    const collide = await capture(() =>
      payload.update({
        collection: 'posts',
        id: second.id,
        data: { slug: firstSlug } as never,
        user: editor as never,
        overrideAccess: false,
      }),
    )
    expect(collide).not.toBeNull()
  }, 60000)

  it('[PC11] version history records each save and an older version can be restored', async () => {
    const post = await createDraft(journalistA, t('PC11', 'نسخة ١'))
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: t('PC11', 'نسخة ٢') } as never,
      draft: true,
      user: journalistA as never,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: t('PC11', 'نسخة ٣') } as never,
      draft: true,
      user: journalistA as never,
      overrideAccess: false,
    })
    expect((await read(post.id, true)).title).toBe(t('PC11', 'نسخة ٣'))

    const versions = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: post.id } },
      limit: 100,
      sort: '-updatedAt',
    })
    // One per deliberate save: the create plus the two updates.
    expect(versions.totalDocs).toBeGreaterThanOrEqual(3)
    const titles = versions.docs.map((v) => v.version.title)
    expect(titles).toContain(t('PC11', 'نسخة ١'))
    expect(titles).toContain(t('PC11', 'نسخة ٢'))
    expect(titles).toContain(t('PC11', 'نسخة ٣'))

    const oldest = versions.docs.find((v) => v.version.title === t('PC11', 'نسخة ١'))
    expect(oldest).toBeTruthy()
    await payload.restoreVersion({
      collection: 'posts',
      id: String(oldest?.id),
      draft: true,
    })

    // The restore must actually move the document back...
    const restored = await read(post.id, true)
    expect(restored.title).toBe(t('PC11', 'نسخة ١'))
    expect(restored._status).toBe('draft')
    // ...without losing the rest of the document...
    expect(restored.category).toBe(newsCategory)
    expect(JSON.stringify(restored.content)).toContain('نص مقال التدقيق.')
    expect(restored.authors).toEqual([journalistA.id])
    // ...and the restore itself must be recorded, so the history is not rewritten.
    const afterRestore = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: post.id } },
      limit: 100,
      sort: '-updatedAt',
    })
    expect(afterRestore.totalDocs).toBeGreaterThan(versions.totalDocs)
    expect(afterRestore.docs.map((v) => v.version.title)).toContain(t('PC11', 'نسخة ٣'))
  }, 60000)

  it('[PC12] the revalidate hook runs on publish and on delete', async () => {
    const spy = await revalidateSpy()
    const post = await createDraft(journalistA, t('PC12'))

    spy.mockClear()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(post.id))._status).toBe('published')
    expect(spy).toHaveBeenCalledWith('/', 'layout')
    const afterPublish = spy.mock.calls.length
    expect(afterPublish).toBeGreaterThanOrEqual(1)

    spy.mockClear()
    await payload.delete({ collection: 'posts', id: post.id })
    untrack(post.id)
    expect(spy).toHaveBeenCalledWith('/', 'layout')
    // And the post really is gone, so the delete hook fired on a real delete.
    const gone = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      limit: 1,
      depth: 0,
    })
    expect(gone.totalDocs).toBe(0)
  }, 60000)

  it('[PC13] excerpt and featuredType derivations survive a partial update', async () => {
    const post = await createDraft(journalistA, t('PC13'), {
      content: body('افتتاحية المقال المشتقة تلقائيًا للمقتطف.'),
      featuredVideoUrl: 'https://www.youtube.com/watch?v=auditpc13',
    })
    const initial = await read(post.id)
    expect(initial.featuredType).toBe('video')
    expect(initial.excerpt).toBe('افتتاحية المقال المشتقة تلقائيًا للمقتطف.')

    // A patch that mentions neither featuredVideoUrl nor content — the shape every
    // sidebar-only save and every REST partial update takes.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: t('PC13', 'منقّح') } as never,
      draft: true,
      user: journalistA as never,
      overrideAccess: false,
    })
    const afterPartial = await read(post.id, true)
    expect(afterPartial.title).toBe(t('PC13', 'منقّح'))
    expect(afterPartial.featuredType).toBe('video')
    expect(afterPartial.excerpt).toBe('افتتاحية المقال المشتقة تلقائيًا للمقتطف.')

    // A hand-written excerpt is the editor's, and a later content edit must not
    // overwrite it.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { excerpt: 'مقتطف كتبه محرّر بيده.' } as never,
      draft: true,
      user: editor as never,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { content: body('نص جديد تمامًا بعد إعادة الكتابة.') } as never,
      draft: true,
      user: journalistA as never,
      overrideAccess: false,
    })
    const afterRewrite = await read(post.id, true)
    expect(afterRewrite.excerpt).toBe('مقتطف كتبه محرّر بيده.')
    expect(afterRewrite.featuredType).toBe('video')

    // Clearing the video URL is the one thing that may demote the header.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { featuredVideoUrl: '' } as never,
      draft: true,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await read(post.id, true)).featuredType).toBe('image')
  }, 60000)

  it('[PC14] a future publishedAt does not surface the post in public listings', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const post = await createDraft(journalistA, t('PC14'))
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published', publishedAt: future } as never,
      user: editor as never,
      overrideAccess: false,
    })
    const stored = await read(post.id)
    expect(stored.publishedAt).toBe(future)
    expect(stored._status).toBe('published')

    // `getPosts` sorts by -publishedAt, so a future-dated article lands on the
    // FIRST page — it cannot be missed by this query for want of paging.
    const { getPosts, getLatestPosts } = await import('@/lib/queries')
    const listing = await getPosts({ limit: 100 })
    expect(listing.docs.map((d) => d.id)).not.toContain(post.id)
    expect((await getLatestPosts(100)).map((d) => d.id)).not.toContain(post.id)

    // Control: once the date is in the past, the same article must appear — so
    // this probe is measuring the schedule, not a generally broken listing.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { publishedAt: new Date(Date.now() - 60_000).toISOString() } as never,
      user: editor as never,
      overrideAccess: false,
    })
    expect((await getPosts({ limit: 100 })).docs.map((d) => d.id)).toContain(post.id)
  }, 60000)
})
