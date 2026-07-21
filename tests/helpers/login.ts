import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  await page.goto(`${serverURL}/admin/login`)

  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')

  await page.waitForURL(`${serverURL}/admin`)

  // Confirms the authenticated dashboard actually rendered. Asserts on the custom
  // BeforeDashboard's welcome heading ("أهلًا، <name> 👋"), which renders for every
  // role once the panel loads server-side — a stable artifact that does not depend
  // on button/pill copy (the "مقال جديد" pill it used to check was replaced by the
  // WordPress-style "اكتب مقالًا جديدًا" CTA + At-a-Glance strip).
  const dashboardArtifact = page.getByRole('heading', { name: /أهلًا/ }).first()
  await expect(dashboardArtifact).toBeVisible()
}
