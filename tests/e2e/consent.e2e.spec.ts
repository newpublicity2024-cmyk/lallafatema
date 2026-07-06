import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'
const COOKIE = 'lf-consent'

async function getConsentCookie(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies(BASE)
  return cookies.find((c) => c.name === COOKIE)?.value
}

test.describe('Consent / CMP', () => {
  test('shows on first visit and Accept all grants + persists', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(BASE)
    const banner = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: 'قبول الكل' }).click()
    await expect(banner).toBeHidden()
    expect(await getConsentCookie(context)).toBe('1:a=1,ads=1')

    // A consent update was pushed to the dataLayer.
    const updates = await page.evaluate(() =>
      (window as unknown as { dataLayer?: unknown[] }).dataLayer?.filter(
        (e) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update',
      ),
    )
    expect(updates && updates.length).toBeGreaterThan(0)

    await page.reload()
    await expect(banner).toBeHidden()
  })

  test('Reject all denies and persists', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(BASE)
    const banner = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await banner.getByRole('button', { name: 'رفض الكل' }).click()
    expect(await getConsentCookie(context)).toBe('1:a=0,ads=0')
  })

  test('Customize saves per-category choices', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(BASE)
    const banner = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await banner.getByRole('button', { name: 'تخصيص' }).click()
    await banner.getByLabel('إحصاءات').check()
    await banner.getByRole('button', { name: 'حفظ التفضيلات' }).click()
    expect(await getConsentCookie(context)).toBe('1:a=1,ads=0')
  })

  test('footer button reopens the banner', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(BASE)
    const banner = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await banner.getByRole('button', { name: 'قبول الكل' }).click()
    await expect(banner).toBeHidden()

    await page.getByRole('button', { name: 'إعدادات ملفات تعريف الارتباط' }).click()
    await expect(banner).toBeVisible()
  })
})
