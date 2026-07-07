import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Video watch pages', () => {
  test('homepage band card → watch page plays + shows related', async ({ page }) => {
    await page.goto(BASE)

    // The homepage video band cards link to /videos/<slug>-<id>.
    const card = page.locator('a[href^="/videos/"]').first()
    await expect(card).toBeVisible()
    const href = await card.getAttribute('href')
    expect(href).toMatch(/^\/videos\/.+-\d+$/)

    await page.goto(`${BASE}${decodeURI(href!)}`)
    await expect(page.locator('h1')).toBeVisible()

    // Facade: play button present, iframe absent until click.
    await expect(page.locator('iframe')).toHaveCount(0)
    const play = page.getByRole('button', { name: /تشغيل/ })
    await expect(play).toBeVisible()
    await play.click()
    await expect(page.locator('iframe')).toBeVisible()

    // Related rail renders.
    await expect(page.getByText('مقاطع ذات صلة')).toBeVisible()
  })
})
