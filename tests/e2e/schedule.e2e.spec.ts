import { test, expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import { BASE_URL } from '../../playwright.config'
import { login } from '../helpers/login'
import { seedUser, removeUser } from '../helpers/seedUser'

/**
 * The scheduling surfaces, in a real browser.
 *
 * `schedule-chain.int.spec.ts` proves the rules and the queries. This proves a journalist
 * can SEE their programmed article: that the dashboard grew a card listing it with its
 * newsroom time, that the article's own sidebar says when it goes live, and — the half that
 * matters most for not misleading anyone — that it is NOT sitting in "آخر ما نُشر لي" as
 * though it were already on the site.
 *
 * SHARED-DATABASE DISCIPLINE: the database is shared with PRODUCTION. The one article this
 * spec creates is published with a FUTURE date, which the site's own rule keeps invisible to
 * everyone but its author; it never creates an article a reader could open. Where a control
 * needs a genuinely live article, it borrows one from the corpus read-only. Earlier this
 * spec created a past-dated fixture as that control — a published article by definition —
 * and that is exactly what put a test post on the real homepage. The fixture and the account
 * are removed in `afterAll`.
 */

const RUN = `SCHEDE2E${Date.now().toString(36).toUpperCase()}`

const journalist = {
  email: `${RUN.toLowerCase()}@payloadcms.com`,
  password: 'test',
  name: `${RUN} صحفي`,
  role: 'journalist' as const,
}

/** 48h out, so the label can never collide with "اليوم" and the date is unambiguous. */
const SCHEDULED_AT = new Date(Date.now() + 48 * 3_600_000)
const SCHEDULED_TITLE = `${RUN} مقال مبرمج`

let payload: Payload
let scheduledId: number
/** A genuinely live article's id, borrowed read-only as the visibility control. */
let liveControlId: number
let page: Page

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

test.describe('Scheduled publishing — the journalist’s view', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000)

    await seedUser(journalist)
    payload = await getPayload({ config: await (await import('../../src/payload.config')).default })

    const { docs: users } = await payload.find({
      collection: 'users',
      where: { email: { equals: journalist.email } },
      limit: 1,
    })
    const authorId = users[0]!.id

    const { docs: cats } = await payload.find({
      collection: 'categories',
      where: { slug: { equals: 'news' } },
      limit: 1,
    })
    if (!cats[0]) throw new Error('fixture precondition failed: no "news" category')

    // ONE article, programmed for 48h out, so it is invisible to the public throughout.
    scheduledId = (
      await payload.create({
        collection: 'posts',
        data: {
          title: SCHEDULED_TITLE,
          category: cats[0]!.id,
          authors: [authorId],
          content: body('نص مقال الاختبار.'),
          publishedAt: SCHEDULED_AT.toISOString(),
          _status: 'published',
        } as never,
      })
    ).id as number

    // The visibility control — a real live article, read-only.
    const { publishedWhere } = await import('../../src/lib/published-where')
    const live = await payload.find({
      collection: 'posts',
      where: publishedWhere(),
      sort: '-publishedAt',
      limit: 1,
      depth: 0,
    })
    if (!live.docs[0]) {
      throw new Error('fixture precondition failed: no live article for the control')
    }
    liveControlId = live.docs[0].id as number

    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, serverURL: BASE_URL, user: journalist })
  })

  test.afterAll(async () => {
    if (scheduledId) await payload.delete({ collection: 'posts', id: scheduledId }).catch(() => {})
    await payload
      .delete({ collection: 'posts', where: { title: { like: RUN } } })
      .catch(() => {})
    await removeUser(journalist)
  })

  test('the dashboard has a "مبرمج للنشر" card listing the article with its newsroom time', async () => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })

    const card = page.locator('.widget[data-slug^="lf-scheduled"]')
    await expect(card, 'the scheduled widget is missing from the dashboard').toBeVisible()
    await expect(card.getByText('مبرمج للنشر').first()).toBeVisible()

    // The article itself — proof the widget ran its query rather than rendering a shell.
    const row = card.locator('.lf-row', { hasText: RUN })
    await expect(row, 'the programmed article is not listed in its own card').toBeVisible()
    await expect(row.locator('.lf-row__title')).toContainText(SCHEDULED_TITLE)

    // ...and the time chip, which is the entire reason a writer opens this card.
    const chip = row.locator('.lf-chip--time')
    await expect(chip).toBeVisible()
    await expect(chip, 'the scheduled time is not labelled with its zone').toContainText(
      'بتوقيت المغرب',
    )
    // Arabic digits or Latin, but a clock has to be in there somewhere.
    await expect(chip).toContainText(/[\d٠-٩]/)
  })

  test('the programmed article is not shown as recently published', async () => {
    const published = page.locator('.widget[data-slug^="lf-published"]')
    await expect(published).toBeVisible()

    /*
     * The defect this feature had to fix: the card sorts `-publishedAt`, so a programmed
     * article used to sit at its TOP with a «عرض» link that 404s.
     *
     * The card is asserted to have RENDERED — via its own empty state, which is correct for
     * a journalist whose only article is programmed — before its emptiness is read as
     * meaningful. Without that, "the article is absent" would also pass for a widget that
     * crashed. (A live article by this journalist would be a stronger control, but creating
     * one means publishing to a production database, which is what this spec no longer does.)
     */
    await expect(
      published.getByText('لم يُنشر شيء بعد'),
      'the published card did not render, so its emptiness proves nothing',
    ).toBeVisible()
    await expect(
      published.locator('.lf-row', { hasText: SCHEDULED_TITLE }),
      'a programmed article is being shown as recently published',
    ).toHaveCount(0)
  })

  test('the numbers strip counts it as programmed, not as live', async () => {
    const stats = page.locator('.lf-stats')
    await expect(stats).toBeVisible()

    const tile = stats.locator('.lf-stat', { hasText: 'مبرمج للنشر' })
    await expect(tile, 'there is no "مبرمج للنشر" tile').toBeVisible()
    // At least this run's article. Other scheduled work may exist on a live site, so the
    // assertion is ">= 1" rather than an exact count.
    const value = await tile.locator('.lf-stat__value').innerText()
    expect(Number(value.replace(/[^\d]/g, '')), 'the scheduled tile reads zero').toBeGreaterThan(0)
  })

  test('the article’s own sidebar says when it goes live', async () => {
    await page.goto(`/admin/collections/posts/${scheduledId}`, { waitUntil: 'domcontentloaded' })

    const sidebar = page.locator('.document-fields__sidebar')
    await expect(sidebar).toBeVisible()

    // SchedulePanel renders client-side after mount (it reads the wall clock), so this
    // waits on the text rather than asserting immediately.
    await expect(sidebar.getByText('مبرمج للنشر')).toBeVisible({ timeout: 30_000 })
    await expect(sidebar.getByText(/يظهر للزوّار تلقائيًا/)).toBeVisible()
    await expect(sidebar.getByText(/بتوقيت المغرب/)).toBeVisible()

    // And the control that set it is right there, editable by this journalist.
    await expect(sidebar.locator('#field-publishedAt')).toBeVisible()
  })

  test('the public article URL stays a 404 until its moment', async () => {
    // The first request to `[category]/[slug]` also compiles that route in the dev server,
    // which costs far more than Playwright's 30s default.
    test.setTimeout(120_000)

    /*
     * The reader-facing half, through a real HTTP request — this is what a leaked link hits.
     *
     * EXACTLY 404 is the assertion, and the specific code is its own control: a route that
     * could not render would answer 500, and one that served the article would answer 200.
     * So "404" already distinguishes "the route ran and deliberately hid this post" from
     * "the route is broken", with no second article needed.
     *
     * (That distinction was not hypothetical. Articles containing a Lexical `linebreak`
     * node — 168 of 1,575 — used to answer 500 from this route in dev, and an earlier
     * version of this test picked one as its control and timed out on it. The cause was
     * `alignAll` in RichTextBody rebuilding Payload's pre-built `<br>` converter element
     * and stripping its non-enumerable properties, which Next's RSC serializer rejects;
     * it is fixed, and `rich-text-body.int.spec.tsx` guards it. Keeping the control at the
     * API layer anyway: it is cheaper and it tests the access rule directly.)
     */
    const res = await page.request.get(`/news/${scheduledId}`)
    expect(res.status(), 'a programmed article is being served to the public').toBe(404)
    expect(await res.text()).not.toContain(SCHEDULED_TITLE)

    /*
     * ...and the same rule at the API layer, which is where the control belongs: cheap, no
     * page to compile, and it exercises `canReadPosts` directly.
     *
     * Plain `fetch`, deliberately NOT `page.request` — the page carries the journalist's
     * session cookie, and the author is allowed to see their own programmed article. Only
     * an unauthenticated caller tests what the public gets.
     */
    const anonScheduled = await fetch(`${BASE_URL}/api/posts/${scheduledId}`)
    expect(
      anonScheduled.status,
      'the REST API hands a programmed article to an anonymous caller',
    ).not.toBe(200)

    const anonLive = await fetch(`${BASE_URL}/api/posts/${liveControlId}`)
    expect(
      anonLive.status,
      `the live control article (${liveControlId}) is not readable anonymously either, so the ` +
        `exclusion above proves nothing`,
    ).toBe(200)
  })
})
