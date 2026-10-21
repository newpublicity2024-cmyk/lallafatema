import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test'

import { BASE_URL } from '../../playwright.config'
import { login } from '../helpers/login'

/**
 * "A journalist can put a video file in an article", proved in a real browser.
 *
 * This is the outcome the rest of the video work exists to serve, and it is the one that no
 * unit test can reach: the block config can be perfect, the renderer can be perfect, and the
 * capability is still worthless if the block is not in the editor's menu or the upload field
 * refuses an MP4. So the test walks the newsroom's own path — open the article, open the
 * blocks menu, pick "فيديو من ملف", upload a real MP4 through the drawer — and then asserts
 * on the JSON that reached Postgres. The DOM alone would pass for a block that renders and
 * serialises wrong; the JSON alone would pass for a block nobody can insert.
 *
 * The plumbing follows `editor-blocks.e2e.spec.ts`, whose three hard-won constraints apply
 * unchanged: no importing `src/payload.config.ts` (it reaches `next/cache`, which
 * Playwright's transform cannot resolve), REST fixtures over `Authorization: JWT` rather
 * than cookies, and a per-run marker on every document so an aborted run leaves nothing in a
 * database that dev and PRODUCTION share.
 *
 * ONE ENVIRONMENT PRECONDITION, checked before the first test rather than discovered as a
 * mystery failure. Payload's CSRF allowlist is `allowedOrigins()`, which is the canonical
 * production origin plus `NEXT_PUBLIC_SERVER_URL`. If that variable is unset, the admin's
 * own cookie-authenticated autosave is answered 403 — the editor looks fine and silently
 * saves nothing. `beforeAll` fails with that sentence instead of letting a test time out
 * waiting for a block that was never going to be written.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Unique per run; the only thing standing between a fixture and the live corpus. */
const RUN = `E2EVF${Date.now().toString(36).toUpperCase()}`

const adminUser = {
  email: `${RUN.toLowerCase()}-editor@payloadcms.com`,
  name: 'Video File E2E',
  password: 'test',
  role: 'admin',
}

/** A real 1-second h264/aac MP4, ~2.6 KB. Real bytes because the guard sniffs them. */
const TINY_MP4 = path.join(REPO_ROOT, 'tests/e2e/fixtures/tiny-video.mp4')

/** Generous: the admin is a streamed RSC document and the first hit compiles it. */
const ADMIN_TIMEOUT = 120_000

let api: APIRequestContext
const createdPosts: (number | string)[] = []

// ---------------------------------------------------------------------------
// Payload local API in a child process — the account seed only
// ---------------------------------------------------------------------------

function payloadScript(code: string): string {
  return String(
    execFileSync('node', ['--import=tsx/esm', '--input-type=module', '-e', code], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 240_000,
    }),
  )
}

function seedAdminUser(): void {
  payloadScript(`
import 'dotenv/config'
import { getPayload } from 'payload'
import config from './src/payload.config.ts'
const payload = await getPayload({ config })
const user = ${JSON.stringify(adminUser)}
await payload.delete({ collection: 'users', where: { email: { equals: user.email } }, overrideAccess: true })
const doc = await payload.create({ collection: 'users', data: user, overrideAccess: true })
console.log('SEEDED ' + doc.email)
process.exit(0)
`)
}

function removeAdminUser(): void {
  payloadScript(`
import 'dotenv/config'
import { getPayload } from 'payload'
import config from './src/payload.config.ts'
const payload = await getPayload({ config })
await payload.delete({ collection: 'users', where: { email: { equals: ${JSON.stringify(adminUser.email)} } }, overrideAccess: true })
process.exit(0)
`)
}

// ---------------------------------------------------------------------------
// REST fixtures
// ---------------------------------------------------------------------------

async function authenticatedApi(): Promise<APIRequestContext> {
  const anon = await playwrightRequest.newContext({ baseURL: BASE_URL })
  const res = await anon.post('/api/users/login', {
    data: { email: adminUser.email, password: adminUser.password },
  })
  const ok = res.ok()
  const body = ok ? ((await res.json()) as { token?: string }) : null
  const detail = ok ? '' : `${res.status()} ${await res.text()}`
  await anon.dispose()

  if (!body?.token) throw new Error(`REST login failed for the fixture account: ${detail}`)
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `JWT ${body.token}` },
  })
}

/** A body ending in an empty paragraph, so there is a blank line to insert a block onto. */
const fixtureBody = () => ({
  root: {
    children: [
      {
        children: [
          { detail: 0, format: 0, mode: 'normal', style: '', text: 'فقرة قبل الفيديو', type: 'text', version: 1 },
        ],
        direction: 'rtl',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
      { children: [], direction: 'rtl', format: '', indent: 0, type: 'paragraph', version: 1 },
    ],
    direction: 'rtl',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

async function createFixturePost(marker: string): Promise<number | string> {
  // READ-ONLY use of the live corpus: a post needs a category, and inventing one would add a
  // row to the production taxonomy.
  const cats = await api.get('/api/categories?limit=1&depth=0')
  expect(cats.ok(), 'could not read a category to attach the fixture post to').toBeTruthy()
  const category = ((await cats.json()) as { docs?: { id: number | string }[] }).docs?.[0]?.id
  if (category === undefined) throw new Error('no category exists to attach a fixture post to')

  const res = await api.post('/api/posts?draft=true', {
    data: {
      _status: 'draft',
      category,
      content: fixtureBody(),
      title: `${RUN} ${marker} مقال تجربة الفيديو`,
    },
  })
  expect(res.ok(), `fixture post create failed: ${res.status()}`).toBeTruthy()
  const id = ((await res.json()) as { doc?: { id: number | string } }).doc?.id
  if (id === undefined) throw new Error('fixture post create returned no id')
  createdPosts.push(id)
  return id
}

type StoredVideoFileBlock = {
  blockType?: string
  video?: number | { id: number; mimeType?: string; filesize?: number; url?: string }
  poster?: number | null
  caption?: string | null
}

/** The videoFile blocks in the post's latest DRAFT — i.e. what autosave actually wrote. */
async function readVideoBlocks(id: number | string, depth = 1): Promise<StoredVideoFileBlock[]> {
  const res = await api.get(`/api/posts/${id}?draft=true&depth=${depth}`)
  if (!res.ok()) return []
  const doc = (await res.json()) as {
    content?: { root?: { children?: { type?: string; fields?: StoredVideoFileBlock }[] } }
  }
  return (doc.content?.root?.children ?? [])
    .filter((child) => child?.type === 'block' && child?.fields?.blockType === 'videoFile')
    .map((child) => child.fields as StoredVideoFileBlock)
}

/** Opens the article in the editor and returns its Lexical body, visible. */
async function openEditor(page: Page, id: number | string) {
  await page.goto(`/admin/collections/posts/${id}`)
  const body = page.locator('.ContentEditable__root')
  await expect(body).toBeVisible({ timeout: ADMIN_TIMEOUT })
  return body
}

/**
 * Inserts the `videoFile` block the way a journalist does: caret in the body, blocks
 * dropdown, pick the Arabic entry.
 *
 * Selected by `data-item-key`, which Payload derives as `block-<slug>` from the block config
 * itself — so this cannot pass against a different block, and it keeps working if the label
 * is reworded.
 */
async function insertVideoBlock(page: Page, body: Locator): Promise<Locator> {
  await body.click()
  await page.locator('button[aria-label="blocks dropdown"]').click()
  const item = page.locator('[data-item-key="block-videoFile"]')
  await expect(item, 'the video-file block is missing from the editor block menu').toBeVisible({
    timeout: ADMIN_TIMEOUT,
  })
  await item.click()
  const block = page.locator('.LexicalEditorTheme__block-videoFile')
  await expect(block).toBeVisible({ timeout: ADMIN_TIMEOUT })
  return block
}

// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  // The precondition described in the file header. A 403 here is an environment fault, not a
  // defect in the feature, and it must say so.
  const probe = await playwrightRequest.newContext({ baseURL: BASE_URL })
  const access = await probe.get('/api/access')
  await probe.dispose()
  expect(access.ok(), `${BASE_URL}/api/access did not answer — is the dev server up?`).toBeTruthy()

  if (!process.env.NEXT_PUBLIC_SERVER_URL) {
    throw new Error(
      'NEXT_PUBLIC_SERVER_URL is unset, so Payload\'s CSRF allowlist holds only the production ' +
        'origin and every cookie-authenticated admin save is answered 403 — the editor appears ' +
        `to work and stores nothing. Run this spec with NEXT_PUBLIC_SERVER_URL=${BASE_URL}.`,
    )
  }

  seedAdminUser()
  api = await authenticatedApi()
})

test.afterAll(async () => {
  for (const id of createdPosts) {
    await api.delete(`/api/posts/${id}`).catch(() => {})
  }
  // Nets, in case a test aborted before its fixture was tracked.
  await api.delete(`/api/posts?where[title][like]=${encodeURIComponent(RUN)}`).catch(() => {})
  // Media uploaded through the drawer: `alt` carries the marker, and deleting the document
  // deletes the stored object with it.
  await api.delete(`/api/media?where[alt][like]=${encodeURIComponent(RUN)}`).catch(() => {})
  await api.dispose().catch(() => {})
  removeAdminUser()
})

test.describe('Article editor — self-hosted video', () => {
  test('[VF01] inserting the block and uploading an MP4 stores a videoFile block bound to the media', async ({
    page,
  }) => {
    const id = await createFixturePost('VF01')
    await login({ page, serverURL: BASE_URL, user: adminUser })
    const body = await openEditor(page, id)
    const block = await insertVideoBlock(page, body)

    // The block the journalist sees: Arabic label, a required video field, an optional poster.
    await expect(block.locator('#field-video')).toBeVisible({ timeout: ADMIN_TIMEOUT })
    await expect(block.locator('#field-poster')).toBeVisible()
    await expect(block).toContainText('ملف الفيديو')

    // Upload a real MP4 through the drawer — the newsroom's own path for a clip that is not
    // already in the media library.
    await block.locator('#field-video .upload__createNewToggler').click()
    const drawer = page.locator('[id^="doc-drawer_media"]').first()
    await expect(drawer).toBeVisible({ timeout: ADMIN_TIMEOUT })

    // The picker must OFFER video, or the journalist cannot even select the file.
    const accept = await drawer.locator('input.file-field__hidden-input').getAttribute('accept')
    expect(accept, 'the media file picker does not offer MP4').toContain('video/mp4')

    await drawer.locator('input.file-field__hidden-input').setInputFiles(TINY_MP4)
    // `alt` is required on media, and carrying the run marker is what lets afterAll find it.
    await drawer.locator('#field-alt').fill(`${RUN} مقطع فيديو تجريبي`)
    await drawer.locator('button#action-save').click()
    await expect(drawer).toBeHidden({ timeout: ADMIN_TIMEOUT })

    // What the editor now shows: the stored file, by name and type.
    await expect(block.locator('#field-video')).toContainText('video/mp4', { timeout: ADMIN_TIMEOUT })

    // Nudge the editor to commit. The block's inner form writes the chosen media into the
    // Lexical node, and autosave fires on the editor's own change — clicking back into the
    // body is what a journalist does next anyway.
    await body.click()

    /*
     * What actually reached Postgres.
     *
     * Polling on "a videoFile block exists" is NOT enough, and getting that wrong is how this
     * test first passed-then-failed: the empty block is autosaved the instant it is inserted,
     * seconds before the upload finishes, so the count reaches 1 while `video` is still null.
     * The outcome being measured is the BINDING, so that is what the poll waits for.
     */
    await expect
      .poll(
        async () => {
          const value = (await readVideoBlocks(id))[0]?.video
          return typeof value === 'object' && value !== null ? 'bound' : `unbound:${String(value)}`
        },
        { timeout: ADMIN_TIMEOUT },
      )
      .toBe('bound')

    const [stored] = await readVideoBlocks(id)
    expect(stored.blockType).toBe('videoFile')
    const video = stored.video
    expect(typeof video === 'object' && video !== null, 'the block stored no media reference').toBeTruthy()
    if (typeof video !== 'object' || video === null) return
    expect(video.mimeType).toBe('video/mp4')
    // The fixture's real byte count — the file was stored whole, not truncated.
    expect(video.filesize).toBe(2605)

    // And the media document it points at is really there and really a video.
    const media = await api.get(`/api/media/${video.id}?depth=0`)
    expect(media.ok()).toBeTruthy()
    const mediaDoc = (await media.json()) as { mimeType?: string; filename?: string }
    expect(mediaDoc.mimeType).toBe('video/mp4')
    expect(mediaDoc.filename).toMatch(/\.mp4$/)
  })

  test('[VF02] the block menu distinguishes the two kinds of video', async ({ page }) => {
    const id = await createFixturePost('VF02')
    await login({ page, serverURL: BASE_URL, user: adminUser })
    const body = await openEditor(page, id)

    await body.click()
    await page.locator('button[aria-label="blocks dropdown"]').click()

    // Both are offered, and they no longer read identically — the whole reason `videoEmbed`
    // was relabelled when this block joined the menu.
    const link = page.locator('[data-item-key="block-videoEmbed"]')
    const file = page.locator('[data-item-key="block-videoFile"]')
    await expect(link).toBeVisible({ timeout: ADMIN_TIMEOUT })
    await expect(file).toBeVisible()
    expect(await link.innerText()).not.toBe(await file.innerText())
    // Arabic-first admin: no Latin script in a block label.
    expect(await file.innerText()).not.toMatch(/[A-Za-z]/)

    // The gallery block is still there — adding one block must not displace another.
    await expect(page.locator('[data-item-key="block-gallery"]')).toBeVisible()
  })
})
