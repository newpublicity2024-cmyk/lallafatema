import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import {
  seedJournalistUser,
  cleanupJournalistUser,
  journalistUser,
  seedEditorUser,
  cleanupEditorUser,
  editorUser,
} from '../helpers/seedUser'

const CREATE_POST = 'http://localhost:3000/admin/collections/posts/create'

/**
 * Negative assertions use `not.toBeVisible()` rather than `toHaveCount(0)`:
 * a field removed by `admin.condition` is absent from the DOM, while one hidden
 * via `admin.hidden` may still be attached. Both are correct outcomes here, and
 * `not.toBeVisible()` passes for either.
 */
test.describe('Article editor — journalist view', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedJournalistUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: journalistUser })
    await page.goto(CREATE_POST)
  })

  test.afterAll(async () => {
    await cleanupJournalistUser()
  })

  test('shows the guidance banner', async () => {
    await expect(page.getByText('ابدأ بالكتابة مباشرة')).toBeVisible()
  })

  test('shows the publish checklist', async () => {
    await expect(page.getByText('قبل الإرسال للمراجعة')).toBeVisible()
  })

  test('hides the slug field', async () => {
    await expect(page.locator('#field-slug')).not.toBeVisible()
  })

  test('hides the SEO group', async () => {
    await expect(page.getByText('تحسين محركات البحث').first()).not.toBeVisible()
  })

  test('hides tags, authors and the publish date', async () => {
    await expect(page.locator('#field-tags')).not.toBeVisible()
    await expect(page.locator('#field-authors')).not.toBeVisible()
    await expect(page.locator('#field-publishedAt')).not.toBeVisible()
  })

  test('hides the derived media-type selector', async () => {
    await expect(page.locator('#field-featuredType')).not.toBeVisible()
  })

  test('shows the video URL field on a brand-new post', async () => {
    // Regression guard: featuredVideoUrl used to be gated behind
    // `featuredType === 'video'`, which became unreachable once featuredType
    // was derived from this very field.
    await expect(page.locator('#field-featuredVideoUrl')).toBeVisible()
  })

  test('shows the fields a journalist actually needs', async () => {
    await expect(page.locator('#field-title')).toBeVisible()
    await expect(page.locator('#field-category')).toBeVisible()
  })
})

test.describe('Article editor — editorial view', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedEditorUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: editorUser })
    await page.goto(CREATE_POST)
  })

  test.afterAll(async () => {
    await cleanupEditorUser()
  })

  test('still sees the slug field', async () => {
    await expect(page.locator('#field-slug')).toBeVisible()
  })

  test('still sees the SEO group', async () => {
    await expect(page.getByText('تحسين محركات البحث').first()).toBeVisible()
  })

  test('still sees tags, authors and the publish date', async () => {
    await expect(page.locator('#field-tags')).toBeVisible()
    await expect(page.locator('#field-authors')).toBeVisible()
    await expect(page.locator('#field-publishedAt')).toBeVisible()
  })

  test('does not see the journalist guidance banner', async () => {
    await expect(page.getByText('ابدأ بالكتابة مباشرة')).not.toBeVisible()
  })
})
