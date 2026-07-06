import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Magazine archive', () => {
  test('lists issues, opens one, shows facade + download, loads viewer on read', async ({ page }) => {
    await page.goto(`${BASE}/magazine`)

    const firstCard = page.locator('a[href^="/magazine/"]').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()
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
})
