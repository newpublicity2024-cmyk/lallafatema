import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = 'http://localhost:3000'

// Accept-all consent cookie so the banner doesn't overlay the base page during
// static audits. The banner's own a11y is covered by the keyboard spec (Task 3)
// and consent.e2e.spec.ts.
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'lf-consent', value: '1:a=1,ads=1', url: BASE }])
})

async function contrastViolations(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' })
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  return results.violations
}

test('homepage has no color-contrast violations', async ({ page }) => {
  const violations = await contrastViolations(page, BASE)
  const summary = violations
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary}`))
    .join('\n')
  expect(violations, summary || 'no color-contrast violations').toEqual([])
})
