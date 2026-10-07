import { test, expect } from '@playwright/test'

// Resolved from `use.baseURL` in playwright.config.ts. Never hardcode a port here:
// this machine runs several dev servers, and a stale absolute URL silently pointed
// the whole suite at a DIFFERENT application. See tests/e2e/global-setup.ts.
const BASE = ''

// e2e runs inert (no Meilisearch credentials): the page must render the form and
// the graceful "coming soon" state, and the GET form must navigate to /search?q=.
test.describe('Search', () => {
  test('renders the search form and the disabled notice', async ({ page }) => {
    await page.goto(`${BASE}/search`)

    const input = page.getByRole('searchbox', { name: 'بحث' })
    await expect(input).toBeVisible()
    await expect(page.getByText('البحث سيتوفر قريبًا.')).toBeVisible()
  })

  test('submitting a query navigates to /search?q= and stays graceful', async ({ page }) => {
    await page.goto(`${BASE}/search`)

    const input = page.getByRole('searchbox', { name: 'بحث' })
    await input.fill('فستان')
    await input.press('Enter')

    await expect(page).toHaveURL(/\/search\?q=/)
    await expect(page.getByText('البحث سيتوفر قريبًا.')).toBeVisible()
  })
})
