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

  // Confirms the authenticated dashboard actually rendered. Asserts on this admin's
  // own content (the custom BeforeDashboard shortcuts) rather than a Payload-internal
  // `span[title="Dashboard"]`, which no longer exists in this build.
  const dashboardArtifact = page.getByRole('link', { name: 'مقال جديد' }).first()
  await expect(dashboardArtifact).toBeVisible()
}
