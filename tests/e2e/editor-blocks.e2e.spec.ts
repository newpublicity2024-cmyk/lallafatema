import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test'

import { BASE_URL } from '../../playwright.config'
import { login } from '../helpers/login'

/**
 * The two paste shortcuts and the article preview, proved in a real browser.
 *
 * Every test asserts on TWO things: the chrome the journalist sees in the editor, and the
 * JSON that actually reached Postgres. The DOM alone would pass for a block that renders
 * but serialises wrong; the JSON alone would pass for a block nobody can see. Only both
 * together mean "pasting photos produced a gallery".
 *
 * Three constraints shape the plumbing, all of them learned the hard way:
 *
 *  1. The spec must be runnable by a bare `npx playwright test` with no loader flags,
 *     because that is how the audit probe invokes it. It therefore CANNOT `import`
 *     `src/payload.config.ts` — that module reaches `next/cache`, which Playwright's own
 *     transform cannot resolve. (This is why `tests/helpers/seedUser.ts` is not imported
 *     here either, despite being the obvious helper: it imports the config.) The one
 *     privileged operation that genuinely needs the local API — creating the test
 *     account — runs in a short-lived `node --import=tsx/esm` child.
 *  2. Everything else goes through the REST API with `Authorization: JWT <token>`, not
 *     cookies: Payload's csrf allowlist (`src/lib/origins.ts`) holds only the canonical
 *     production origin, so a cookie-authenticated fixture call from a Playwright request
 *     context is refused.
 *  3. dev and production SHARE one Neon database. Every document created here carries
 *     `RUN` in its title — or, for media, whose only writable text field is `alt`, in the
 *     file name that `alt` is derived from — and `afterAll` deletes both the tracked ids
 *     and anything else bearing the marker, so an aborted run leaves nothing behind.
 *     No pre-existing document is ever written, and nothing is ever published.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Unique per run; the only thing standing between a fixture and the live corpus. */
const RUN = `E2EEB${Date.now().toString(36).toUpperCase()}`

const adminUser = {
  // A dedicated account. Playwright runs spec files in parallel and the shared
  // `dev@payloadcms.com` fixture is seeded AND deleted by other specs mid-run, so reusing
  // it makes this spec fail for reasons that have nothing to do with the editor.
  email: `${RUN.toLowerCase()}-editor@payloadcms.com`,
  name: 'Editor Blocks E2E',
  password: 'test',
  role: 'admin',
}

/** 1×1 transparent PNG — the smallest thing the upload guard accepts. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

/** Generous: the admin is a streamed RSC document and the first hit compiles it. */
const ADMIN_TIMEOUT = 120_000

type LexicalBlockFields = {
  blockType?: string
  layout?: string
  url?: string
  images?: { image?: number | string }[]
}

let api: APIRequestContext
const createdPosts: (number | string)[] = []

// ---------------------------------------------------------------------------
// Payload local API in a child process — the account seed only
// ---------------------------------------------------------------------------

/**
 * Runs one short ESM script against the Payload local API in a child process carrying
 * `--import=tsx/esm`, which is what lets `src/payload.config.ts` resolve at all.
 */
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

/** A document body ending in an EMPTY paragraph — EB02 needs a blank line to paste onto. */
const fixtureBody = () => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'سطر تجريبي قبل اللصق',
            type: 'text',
            version: 1,
          },
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
  // READ-ONLY use of the live corpus: a post needs a category, and inventing one would add
  // a row to the production taxonomy.
  const cats = await api.get('/api/categories?limit=1&depth=0')
  expect(cats.ok(), 'could not read a category to attach the fixture post to').toBeTruthy()
  const category = ((await cats.json()) as { docs?: { id: number | string }[] }).docs?.[0]?.id
  if (category === undefined) throw new Error('no category exists to attach a fixture post to')

  const res = await api.post('/api/posts?draft=true', {
    data: {
      _status: 'draft',
      category,
      content: fixtureBody(),
      title: `${RUN} ${marker} مقال تجربة المحرر`,
    },
  })
  expect(res.ok(), `fixture post create failed: ${res.status()}`).toBeTruthy()
  const id = ((await res.json()) as { doc?: { id: number | string } }).doc?.id
  if (id === undefined) throw new Error('fixture post create returned no id')
  createdPosts.push(id)
  return id
}

/** Top-level blocks of one type in the post's latest DRAFT — i.e. what autosave wrote. */
async function readBlocks(
  id: number | string,
  blockType: string,
): Promise<LexicalBlockFields[]> {
  const res = await api.get(`/api/posts/${id}?draft=true&depth=0`)
  if (!res.ok()) return []
  const doc = (await res.json()) as {
    content?: { root?: { children?: { type?: string; fields?: LexicalBlockFields }[] } }
  }
  return (doc.content?.root?.children ?? [])
    .filter((child) => child?.type === 'block' && child?.fields?.blockType === blockType)
    .map((child) => child.fields as LexicalBlockFields)
}

// ---------------------------------------------------------------------------
// Browser-side paste simulation
// ---------------------------------------------------------------------------

/**
 * Pastes files the way a browser does: a real `ClipboardEvent` carrying a real
 * `DataTransfer` of real `File`s, dispatched on the contenteditable Lexical has attached
 * its own paste listener to. Nothing about the editor is stubbed — if the feature's
 * command listener is not registered, this cannot pass.
 */
async function pasteImages(page: Page, names: string[]): Promise<void> {
  await page.evaluate(
    ({ base64, fileNames }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

      const transfer = new DataTransfer()
      for (const name of fileNames) {
        transfer.items.add(new File([bytes], name, { type: 'image/png' }))
      }

      const root = document.querySelector('.ContentEditable__root')
      if (!root) throw new Error('no Lexical contenteditable root on the page')
      root.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
      )
    },
    { base64: PNG_BASE64, fileNames: names },
  )
}

/** Same, for a plain-text paste. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', value)
    const root = document.querySelector('.ContentEditable__root')
    if (!root) throw new Error('no Lexical contenteditable root on the page')
    root.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    )
  }, text)
}

/** Opens the article in the editor and returns its Lexical body, visible. */
async function openEditor(page: Page, id: number | string) {
  await page.goto(`/admin/collections/posts/${id}`)
  const body = page.locator('.ContentEditable__root')
  await expect(body).toBeVisible({ timeout: ADMIN_TIMEOUT })
  return body
}

// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  seedAdminUser()
  api = await authenticatedApi()
})

test.afterAll(async () => {
  for (const id of createdPosts) {
    await api.delete(`/api/posts/${id}`).catch(() => {})
  }
  // Nets, in case a test aborted before its fixture was tracked.
  await api
    .delete(`/api/posts?where[title][like]=${encodeURIComponent(RUN)}`)
    .catch(() => {})
  // Media created by the paste: `alt` is derived from the pasted file name, which carries
  // the marker, so this reaches every photo this run uploaded.
  await api.delete(`/api/media?where[alt][like]=${encodeURIComponent(RUN)}`).catch(() => {})
  await api.dispose().catch(() => {})
  removeAdminUser()
})

test.describe('Article editor — paste shortcuts and preview', () => {
  test('[EB01] dropping or pasting SEVERAL images into the body creates ONE gallery block', async ({
    page,
  }) => {
    const id = await createFixturePost('EB01')
    await login({ page, serverURL: BASE_URL, user: adminUser })
    const body = await openEditor(page, id)

    await body.click()
    await pasteImages(page, [`${RUN}-a.png`, `${RUN}-b.png`, `${RUN}-c.png`])

    // What the journalist sees: a gallery block, labelled in Arabic, inside the body.
    await expect(page.getByText('معرض صور').first()).toBeVisible({ timeout: ADMIN_TIMEOUT })

    // What was actually stored: exactly ONE block holding all three photos — not three
    // separate images, which is the failure mode this outcome exists to prevent.
    await expect
      .poll(async () => (await readBlocks(id, 'gallery')).length, { timeout: ADMIN_TIMEOUT })
      .toBe(1)

    const [gallery] = await readBlocks(id, 'gallery')
    expect(gallery?.images).toHaveLength(3)
    expect(gallery?.layout).toBe('mosaic')

    // Every row points at a real media document, so the gallery is renderable rather than
    // merely present.
    for (const row of gallery?.images ?? []) {
      expect(row.image).toBeTruthy()
      const media = await api.get(`/api/media/${row.image}?depth=0`)
      expect(media.ok()).toBeTruthy()
      expect(((await media.json()) as { filename?: string }).filename).toBeTruthy()
    }
  })

  test('[EB02] pasting a supported video link on an empty line creates the videoEmbed block', async ({
    page,
  }) => {
    const id = await createFixturePost('EB02')
    await login({ page, serverURL: BASE_URL, user: adminUser })
    const body = await openEditor(page, id)

    // The fixture body ends in an empty paragraph; click it so the caret sits on a blank
    // line, which is the only place this shortcut is allowed to fire.
    await body.locator('p').last().click()
    await pasteText(page, YOUTUBE_URL)

    await expect(page.getByText('فيديو').first()).toBeVisible({ timeout: ADMIN_TIMEOUT })

    await expect
      .poll(async () => (await readBlocks(id, 'videoEmbed')).length, { timeout: ADMIN_TIMEOUT })
      .toBe(1)

    const [video] = await readBlocks(id, 'videoEmbed')
    // Stored verbatim: the renderer rebuilds the player from the parsed id, so keeping the
    // original is what makes the canonical link recoverable.
    expect(video?.url).toBe(YOUTUBE_URL)

    // And the link was NOT also pasted as text beside the block.
    expect(await body.innerText()).not.toContain('youtube.com/watch')
  })

  test('[EB03] the editor offers a preview showing the article as it appears on the site', async ({
    page,
  }) => {
    const id = await createFixturePost('EB03')
    await login({ page, serverURL: BASE_URL, user: adminUser })
    await openEditor(page, id)

    // Reachable without leaving the editor, and labelled in Arabic like the rest of this
    // admin.
    const toggler = page.locator('#live-preview-toggler')
    await expect(toggler).toBeVisible({ timeout: ADMIN_TIMEOUT })
    await expect(toggler).toHaveAttribute('aria-label', /معاينة/)

    await toggler.click()

    // The preview renders THIS article through the public `/preview` route — the same
    // draft-aware `ArticleView` the live site uses — not an admin-only rendering.
    const frame = page.locator('iframe[src*="/preview"]')
    await expect(frame).toBeVisible({ timeout: ADMIN_TIMEOUT })
    const src = await frame.getAttribute('src')
    expect(src).toContain('collection=posts')
    expect(src).toContain(`id=${id}`)
  })
})
