import { test, expect } from '@playwright/test'

// Resolved from `use.baseURL` in playwright.config.ts. Never hardcode a port here:
// this machine runs several dev servers, and a stale absolute URL silently pointed
// the whole suite at a DIFFERENT application. See tests/e2e/global-setup.ts.
const BASE = ''

// Runs inert (no Sentry DSN configured): the page must make NO request to a Sentry
// ingest host, and the health endpoint must answer liveness.
test.describe('observability (inert)', () => {
  test('loads no Sentry SDK network calls when unconfigured', async ({ page }) => {
    const sentryRequests: string[] = []
    page.on('request', (r) => {
      const url = r.url()
      if (url.includes('sentry.io') || url.includes('ingest.sentry')) sentryRequests.push(url)
    })

    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    expect(sentryRequests).toEqual([])
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('/healthz returns 200 liveness', async ({ request }) => {
    const res = await request.get(`${BASE}/healthz`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
