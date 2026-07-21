import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

test.describe('Mobile homepage redesign', () => {
  // This dev environment's cold homepage response (SSR + DB fetch, uncached) takes
  // ~15-21s by itself (verified via direct curl). On top of that, seeded posts were
  // imported text-only (images deferred, per migration notes) so <img>/iframe src
  // attributes can point at hosts that are unreachable from this sandbox — the
  // browser's default 'load' wait blocks on every subresource (success or failure)
  // and can hang well past the default 30s test timeout. None of that is relevant
  // to these DOM/testid assertions, so navigate with 'domcontentloaded' instead of
  // the default 'load', and give each test extra headroom for the slow SSR response.
  test.describe.configure({ timeout: 60_000 })

  test('hero renders stacked overlay posters on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    // Overlay posters use <h2>; the shared lead + stacked secondaries => >= 2 visible.
    const heroHeadings = page.getByTestId('hero').locator('h2')
    expect(await heroHeadings.count()).toBeGreaterThanOrEqual(2)
    await expect(heroHeadings.first()).toBeVisible()
  })

  test('sections are swipe carousels with dots on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const carousel = page.getByTestId('mobile-carousel').first()
    await expect(carousel).toBeVisible()
    await expect(carousel.getByTestId('carousel-track')).toBeVisible()
    const dots = carousel.getByTestId('carousel-dot')
    expect(await dots.count()).toBeGreaterThan(1)
    await expect(dots.first()).toHaveAttribute('data-active', 'true')
  })

  test('bringing the next slide into view advances the active dot', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const carousel = page.getByTestId('mobile-carousel').first()
    const slides = carousel.getByTestId('carousel-track').locator(':scope > div')
    test.skip((await slides.count()) < 2, 'need >= 2 slides')
    // RTL-safe: scroll the 2nd slide into view rather than computing scrollLeft.
    await slides.nth(1).scrollIntoViewIfNeeded()
    await expect(carousel.getByTestId('carousel-dot').nth(1)).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('video band is a carousel on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    // Scope to the VIDEO band by its heading: MagazineSection is also .lf-band-dark and
    // also renders a mobile carousel, so a bare .lf-band-dark matches two sections.
    const band = page
      .locator('.lf-band-dark')
      .filter({ has: page.getByRole('heading', { name: 'فيديو', exact: true }) })
    test.skip((await band.count()) === 0, 'no video band on the homepage')
    await expect(band.getByTestId('mobile-carousel')).toBeVisible()
  })

  test('desktop shows grids with carousel dots hidden', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const dots = page.getByTestId('carousel-dot')
    if (await dots.count()) {
      await expect(dots.first()).toBeHidden()
    }
    // Desktop hero secondaries are <h3> default cards (mobile posters are <h2>, hidden).
    await expect(page.getByTestId('hero').locator('h3').first()).toBeVisible()
  })
})
