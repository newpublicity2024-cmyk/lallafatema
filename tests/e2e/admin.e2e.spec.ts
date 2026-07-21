import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

test.describe('Admin Panel', () => {
  let page: Page

  test.beforeAll(async ({ browser }, testInfo) => {
    await seedTestUser()

    const context = await browser.newContext()
    page = await context.newPage()

    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('can navigate to dashboard', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page).toHaveURL('http://localhost:3000/admin')
    // Assert on the dashboard's own content (the custom BeforeDashboard shortcuts)
    // rather than a Payload-internal `span[title="Dashboard"]`, which no longer exists
    // in this admin build and made the check silently unanchored.
    const dashboardArtifact = page.getByRole('link', { name: 'مقال جديد' }).first()
    await expect(dashboardArtifact).toBeVisible()
  })

  test('can navigate to list view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users')
    // Payload appends its list-view query state (?depth=1&limit=10), so match the
    // pathname rather than the exact URL.
    await expect(page).toHaveURL(/\/admin\/collections\/users(\?|$)/)
    // The admin is Arabic-localized: Users is labelled 'المستخدمون'
    // (src/collections/Users.ts), so an 'Users' match never resolves.
    const listViewArtifact = page.locator('h1', { hasText: 'المستخدمون' }).first()
    await expect(listViewArtifact).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users/create')
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })
})
