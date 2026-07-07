import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// e2e runs inert (no Brevo credentials): the footer form must render, and submitting
// must show the graceful "coming soon" state — nothing contacts Brevo.
test.describe('Newsletter signup', () => {
  test('footer form renders and submitting shows the disabled notice', async ({ page }) => {
    await page.goto(BASE)

    // Dismiss the consent banner (a fixed bottom-of-viewport overlay shown to fresh
    // visitors — Phase 5) so it doesn't cover the footer form.
    const reject = page.getByRole('button', { name: 'رفض الكل' })
    if (await reject.isVisible().catch(() => false)) await reject.click()

    const email = page.getByLabel('بريدك الإلكتروني')
    await email.scrollIntoViewIfNeeded()
    await expect(email).toBeVisible()

    await email.fill('reader@example.com')
    await page.getByRole('button', { name: 'اشترك' }).click()

    await expect(page.getByText('النشرة ستتوفر قريبًا.')).toBeVisible()
  })
})
