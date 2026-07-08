import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('security headers', () => {
  test('public responses carry the hardening headers and CSP', async ({ page }) => {
    const res = await page.goto(BASE)
    expect(res).not.toBeNull()
    const h = res!.headers()

    expect(h['strict-transport-security']).toContain('max-age=63072000')
    expect(h['x-frame-options']).toBe('SAMEORIGIN')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy']).toContain('geolocation=()')

    // Report-Only during rollout; Task 8 flips this to `content-security-policy`.
    const csp = h['content-security-policy-report-only'] ?? h['content-security-policy']
    expect(csp).toBeTruthy()
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
  })
})
