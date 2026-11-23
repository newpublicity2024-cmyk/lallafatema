import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import { BASE_URL } from '../../playwright.config'

// Resolved from `use.baseURL` in playwright.config.ts. Never hardcode a port here:
// this machine runs several dev servers, and a stale absolute URL silently pointed
// the whole suite at a DIFFERENT application. See tests/e2e/global-setup.ts.
const BASE = ''

type BatchIssue = { issueNumber: number; pdf: number | null }
type Batch = { issues: BatchIssue[]; hasMore: boolean }

const LOAD_MORE = 'عرض المزيد من الأعداد'
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// Accept-all consent cookie so the banner never overlays the grid or the button.
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'lf-consent', value: '1:a=1,ads=1', url: BASE_URL }])
})

/** Issue numbers of the archive cards on screen, in DOM order. */
const shownNumbers = (page: Page) =>
  page
    .locator('article[data-issue-number]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-issue-number'))))

/**
 * Every issue older than `before`, walked through the batch endpoint itself — the
 * independent expectation the UI is held to, so no issue count is hardcoded here.
 */
async function walkOlder(request: APIRequestContext, before: number): Promise<BatchIssue[]> {
  const all: BatchIssue[] = []
  for (let guard = 0; guard < 100; guard++) {
    const res = await request.get(`${BASE}/magazine/issues?before=${before}`)
    expect(res.status()).toBe(200)
    const batch = (await res.json()) as Batch
    expect(batch.issues.length).toBeLessThanOrEqual(20)
    all.push(...batch.issues)
    if (!batch.hasMore) return all
    before = batch.issues.at(-1)!.issueNumber
  }
  throw new Error('batch endpoint never reported hasMore:false')
}

test.describe('Magazine archive', () => {
  test('lists issues, opens one, shows facade + download, loads viewer on read', async ({ page }) => {
    await page.goto(`${BASE}/magazine`)

    // The archive lists issue cards linking to /magazine/<issueNumber>.
    const firstCard = page.locator('a[href^="/magazine/"]').first()
    await expect(firstCard).toBeVisible()
    const href = await firstCard.getAttribute('href')
    expect(href).toMatch(/^\/magazine\/\d+$/)

    // Navigate to the issue page directly (avoids dev-mode client-nav compile
    // latency; the destination content is what we're verifying, not Next routing).
    await page.goto(`${BASE}${href}`)
    await expect(page).toHaveURL(/\/magazine\/\d+/)

    const read = page.getByRole('button', { name: 'قراءة العدد' })
    const download = page.getByRole('link', { name: 'تحميل PDF' })
    await expect(read).toBeVisible()
    await expect(download).toHaveAttribute('href', /.+/)

    // The PDF iframe is absent until the reader opts in.
    await expect(page.locator('iframe')).toHaveCount(0)
    await read.click()
    const frame = page.locator('iframe')
    await expect(frame).toBeVisible()
    await expect(frame).toHaveAttribute('src', /.+/)
  })

  test('shows the 20 newest, then "load more" walks the whole archive once and disappears', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    await page.goto(`${BASE}/magazine`)

    const first = await shownNumbers(page)
    expect(first.length).toBe(20)
    expect(first).toEqual([...first].sort((a, b) => b - a)) // newest first

    const older = await walkOlder(request, first.at(-1)!)
    expect(older.length, 'the archive has issues beyond the first 20').toBeGreaterThan(0)
    const expected = [...first, ...older.map((i) => i.issueNumber)]

    const button = page.getByRole('button', { name: LOAD_MORE })
    let shown = first.length
    while (shown < expected.length) {
      await button.click()
      await expect
        .poll(async () => (await shownNumbers(page)).length, { timeout: 30_000 })
        .toBe(Math.min(expected.length, shown + 20))
      shown = (await shownNumbers(page)).length
    }

    // Every issue exactly once, in order, then no button and an end line.
    expect(await shownNumbers(page)).toEqual(expected)
    await expect(button).toHaveCount(0)
    await expect(page.getByText('وصلتِ إلى أقدم عدد في الأرشيف.')).toBeVisible()

    // Among the appended cards, one links (cover + title) only when its issue has a PDF;
    // cover-only cards link nowhere. (The first batch is covered by the PDF test above.)
    const pdfNumbers = new Set(older.filter((i) => i.pdf !== null).map((i) => i.issueNumber))
    const linkCounts = await page
      .locator('article[data-issue-number]')
      .evaluateAll((els) =>
        els.map((e) => ({
          n: Number(e.getAttribute('data-issue-number')),
          hrefs: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')),
        })),
      )
    for (const { n, hrefs } of linkCounts) {
      if (!older.some((i) => i.issueNumber === n)) continue
      if (pdfNumbers.has(n)) expect(hrefs, `issue ${n}`).toEqual([`/magazine/${n}`, `/magazine/${n}`])
      else expect(hrefs, `cover-only issue ${n}`).toEqual([])
    }

    // The appended covers really render: the oldest card's image decodes once in view.
    const lastImg = page.locator('article[data-issue-number]').last().locator('img')
    await lastImg.scrollIntoViewIfNeeded()
    await expect
      .poll(() => lastImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), {
        timeout: 30_000,
      })
      .toBe(true)

    // The fully expanded archive is still clean for axe.
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('[data-ad-unit]').analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('a cover-only issue page shows its cover, no PDF controls, and is noindex', async ({
    page,
    request,
  }) => {
    const res = await request.get(`${BASE}/magazine/issues?before=999999`)
    const { issues } = (await res.json()) as Batch
    let coverOnly = issues.find((i) => i.pdf === null)
    // The newest batch is all PDFs; look further down for a cover-only issue.
    if (!coverOnly) coverOnly = (await walkOlder(request, issues.at(-1)!.issueNumber)).find((i) => i.pdf === null)
    expect(coverOnly, 'a cover-only issue exists').toBeTruthy()

    await page.goto(`${BASE}/magazine/${coverOnly!.issueNumber}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`العدد ${coverOnly!.issueNumber}`)
    const img = page.locator('figure img')
    await expect(img).toBeVisible()
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true)
    await expect(page.getByRole('button', { name: 'قراءة العدد' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'تحميل PDF' })).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('[data-ad-unit]').analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('the batch endpoint pages strictly below its cursor and rejects junk', async ({ request }) => {
    for (const bad of ['', '?before=', '?before=abc', '?before=0', '?before=-3', '?before=1.5']) {
      const res = await request.get(`${BASE}/magazine/issues${bad}`)
      expect(res.status(), `"${bad}"`).toBe(400)
    }
    const res = await request.get(`${BASE}/magazine/issues?before=150`)
    expect(res.status()).toBe(200)
    const { issues } = (await res.json()) as Batch
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.length).toBeLessThanOrEqual(20)
    expect(issues.every((i) => i.issueNumber < 150)).toBe(true)
    const ns = issues.map((i) => i.issueNumber)
    expect(ns).toEqual([...ns].sort((a, b) => b - a))
  })
})

test('homepage shows the magazine section linking to the archive', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page.getByRole('heading', { name: 'مجلة لالة فاطمة' })).toBeVisible()
  // `:visible` — MagazineSection renders a mobile carousel and a desktop grid, mobile
  // first in the DOM, so a bare .first() resolves to the display:none copy.
  const cover = page.locator('a[href^="/magazine/"]:visible').first()
  await expect(cover).toBeVisible()
})
