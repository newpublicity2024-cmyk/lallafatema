import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

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
