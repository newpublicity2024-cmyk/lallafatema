import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Static / legal pages', () => {
  test('/privacy renders 200 with content (the consent-banner link target)', async ({ page }) => {
    const res = await page.goto(`${BASE}/privacy`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'سياسة الخصوصية' })).toBeVisible()
    await expect(page.getByText(/آخر تحديث/)).toBeVisible()
  })

  test('/about renders 200 without a last-updated line', async ({ page }) => {
    const res = await page.goto(`${BASE}/about`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'من نحن' })).toBeVisible()
    await expect(page.getByText(/آخر تحديث/)).toHaveCount(0)
  })

  test('an unknown top-level slug still 404s', async ({ page }) => {
    const res = await page.goto(`${BASE}/no-such-page-zzz`)
    expect(res?.status()).toBe(404)
  })

  test('an existing category route still renders (no dispatcher regression)', async ({ page }) => {
    const res = await page.goto(`${BASE}/fashion`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 2, name: 'موضة' })).toBeVisible()
  })

  test('sitemap.xml lists the pages', async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xml`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('/privacy')
    expect(body).toContain('/about')
  })
})
