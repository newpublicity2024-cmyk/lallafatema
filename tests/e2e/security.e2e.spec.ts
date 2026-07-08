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

test.describe('CSP enforcement', () => {
  test('serves an enforced CSP with no violations on the homepage', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (
        !t.includes('[Report Only]') &&
        (t.includes('Refused to') || t.includes('violates the following Content Security Policy'))
      ) {
        violations.push(t)
      }
    })

    const res = await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Enforced header name (not report-only) once the flag is flipped.
    expect(res!.headers()['content-security-policy']).toBeTruthy()
    expect(violations).toEqual([])
  })

  test('serves an enforced CSP with no violations on /admin (login screen)', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (
        !t.includes('[Report Only]') &&
        (t.includes('Refused to') || t.includes('violates the following Content Security Policy'))
      ) {
        violations.push(t)
      }
    })

    // Unauthenticated -> Payload serves the /admin login screen.
    const res = await page.goto(`${BASE}/admin`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    expect(res!.headers()['content-security-policy']).toBeTruthy()
    expect(violations).toEqual([])
  })
})
