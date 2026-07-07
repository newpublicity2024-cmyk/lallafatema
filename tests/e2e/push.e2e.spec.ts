import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// e2e runs inert (no OneSignal config): the page must load NO OneSignal SDK, register NO
// OneSignal service worker, and render normally.
test.describe('OneSignal web push (inert)', () => {
  test('loads no OneSignal SDK and registers no OneSignal service worker when unconfigured', async ({
    page,
  }) => {
    const oneSignalRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('onesignal.com')) oneSignalRequests.push(r.url())
    })

    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    // Give any idle-scheduled load a chance to (not) fire.
    await page.waitForTimeout(1500)

    expect(oneSignalRequests).toEqual([])

    const oneSignalSwCount = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.filter((r) => (r.active?.scriptURL ?? '').includes('OneSignal')).length
    })
    expect(oneSignalSwCount).toBe(0)

    // Page still renders normally.
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })
})
