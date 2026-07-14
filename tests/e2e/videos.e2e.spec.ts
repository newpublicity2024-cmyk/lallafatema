import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Videos section + article video hero', () => {
  test('/videos lists video-posts that link to their article', async ({ page }) => {
    await page.goto(`${BASE}/videos`)
    // exact: the section <h2> is exactly "فيديو"; card titles like "…-فيديو" would
    // otherwise collide under Playwright's default substring name match (strict mode).
    await expect(page.getByRole('heading', { name: 'فيديو', exact: true })).toBeVisible()
    // PostCard markup is <article>…<h3><a href="/cat/slug-id">…</a></h3>; assert a card
    // links to an article. (article h3 a — the anchor is INSIDE the heading.)
    const card = page.locator('article h3 a[href*="/"]').first()
    await expect(card).toBeVisible()
  })

  test('old /videos/<slug>-<id> watch URL 301s to /videos', async ({ page }) => {
    const res = await page.goto(`${BASE}/videos/some-old-video-123`)
    expect(page.url()).toBe(`${BASE}/videos`)
    expect(res?.status()).toBeLessThan(400)
  })

  test('a video article hero loads no iframe until click', async ({ page }) => {
    // Navigate to the first video-post from /videos.
    await page.goto(`${BASE}/videos`)
    const link = page.locator('article a[href*="/"]').first()
    const href = await link.getAttribute('href')
    test.skip(!href, 'no video-posts seeded')
    await page.goto(`${BASE}${decodeURI(href!)}`)
    await expect(page.locator('iframe')).toHaveCount(0)
    const play = page.getByRole('button', { name: /تشغيل/ }).first()
    await expect(play).toBeVisible()
    await play.click()
    await expect(page.locator('iframe')).toBeVisible()
  })
})
