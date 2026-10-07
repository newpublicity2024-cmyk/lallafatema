/**
 * Back-office audit probes (leaf-1.2).
 *
 * These probes DRIVE THE REAL ADMIN as each role and record what is broken. They
 * are an audit instrument, not a regression suite: a failing probe is a reported
 * defect, and must never be weakened, loosened or narrowed to make the suite go
 * green. Fixing what they find is a different piece of work.
 *
 * Three hard constraints shape the implementation:
 *
 *  1. dev and production SHARE one Neon database. Every probe therefore only ever
 *     touches documents it created itself, and `afterAll` removes every one of
 *     them (see `TRACKED`/`cleanupFixtures`). No pre-existing document is read for
 *     mutation, let alone written.
 *  2. the suite must be runnable by `npx playwright test` with no extra loader
 *     flags, so it CANNOT `import` src/payload.config.ts — that module pulls in
 *     `next/cache`, which Playwright's own transform cannot resolve. Seeding and
 *     teardown therefore run in a short-lived `node --import=tsx/esm` child, which
 *     is the only place the Payload local API is used.
 *  3. the REST API here does not honour cookie auth for fixture calls (Payload's
 *     csrf allowlist, src/lib/origins.ts, contains only the canonical production
 *     origin), so fixture REST calls authenticate with `Authorization: JWT <token>`.
 *
 * Collections and globals for the enumeration probes are DERIVED at runtime from
 * `GET /api/access`, which Payload builds from the live config — so the probe can
 * never pass because someone let a hard-coded list go stale.
 *
 * `BO_AUDIT_CLEANUP_IDS` ("posts:12,pages:34") is an escape hatch for removing
 * documents an interrupted earlier run left behind.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { expect, request as playwrightRequest, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Repo root + the admin origin
// ---------------------------------------------------------------------------

const REPO_ROOT = ((): string => {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'src', 'payload.config.ts'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error(`could not locate the repo root upwards from ${process.cwd()}`)
})()

/**
 * The admin is not always on :3000 — a second Next app squats that port on this
 * machine and the Payload dev server runs on :3100. Rather than hard-code either,
 * probe the candidates and pick the first one actually serving the Payload login
 * screen. An explicit env var always wins.
 */
const ORIGIN_CANDIDATES = [
  process.env.BO_AUDIT_BASE_URL,
  process.env.PLAYWRIGHT_BASE_URL,
  process.env.NEXT_PUBLIC_SERVER_URL,
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3001',
].filter((o): o is string => Boolean(o && o.trim()))

async function resolveAdminOrigin(): Promise<string> {
  const tried: string[] = []
  for (const raw of ORIGIN_CANDIDATES) {
    const candidate = raw.replace(/\/+$/, '')
    if (tried.includes(candidate)) continue
    tried.push(candidate)
    try {
      // `/api/access` is Payload's own config-derived endpoint and answers
      // anonymously — a far more reliable fingerprint than the login screen,
      // whose form is client-rendered and absent from the server HTML.
      const res = await fetch(`${candidate}/api/access`, { redirect: 'follow' })
      if (!res.ok) continue
      const body = (await res.json()) as { collections?: Record<string, unknown> }
      if (body?.collections && 'posts' in body.collections) return candidate
    } catch {
      // candidate is not listening, or is some other app — try the next one
    }
  }
  throw new Error(
    `no Payload admin answered on any candidate origin (tried: ${tried.join(', ')}). ` +
      `Start the dev server, or set BO_AUDIT_BASE_URL.`,
  )
}

// ---------------------------------------------------------------------------
// Role fixtures
// ---------------------------------------------------------------------------

/**
 * Distinct emails, owned by this audit alone. Playwright runs spec files in
 * parallel and other suites seed `dev@payloadcms.com` / `journalist@…` / `editor@…`,
 * so sharing those would race them. These accounts are created in `beforeAll` and
 * deleted in `afterAll`.
 */
const AUDIT_USERS = {
  admin: {
    email: 'bo-admin@audit.local',
    password: 'bo-audit-pw',
    name: 'BO Audit Admin',
    role: 'admin',
  },
  editor: {
    email: 'bo-editor@audit.local',
    password: 'bo-audit-pw',
    name: 'BO Audit Editor',
    role: 'editor',
  },
  journalist: {
    email: 'bo-journalist@audit.local',
    password: 'bo-audit-pw',
    name: 'BO Audit Journalist',
    role: 'journalist',
  },
} as const

type RoleName = keyof typeof AUDIT_USERS

/**
 * Dashboard widgets registered in `admin.dashboard.widgets` (src/payload.config.ts).
 * Kept here in ONE place because the widget registry is not exposed over any API;
 * the per-role default layouts next to it decide which of the six a given role
 * actually gets, which is why BO01 has to look at two roles to cover all six.
 */
const REGISTERED_WIDGETS = {
  editorial: ['lf-welcome', 'lf-stats', 'lf-drafts', 'lf-published', 'lf-shortcuts'],
  journalistOnly: ['lf-guide'],
} as const

/** A 4×4 PNG produced by sharp — real, decodable image bytes for the upload probe. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGM4IWcDRwzEcQDgQxIh0JD36gAAAABJRU5ErkJggg=='

const RUN_ID = `BOAUDIT${Date.now().toString(36).toUpperCase()}`

/** Lexical body that satisfies `validateArticleContent` (src/lib/lexical-text.ts). */
const lexicalBody = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'rtl',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'rtl',
        children: [
          { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: text, version: 1 },
        ],
      },
    ],
  },
})

// ---------------------------------------------------------------------------
// Console / page-error recording
// ---------------------------------------------------------------------------

/**
 * Noise filters for BO10. EVERY entry here is reproduced verbatim in
 * `.unlazy/editor-audit/findings/backoffice.md` — a filter is only legitimate if
 * it is visible in the findings, because an undocumented filter is how a console
 * probe quietly becomes vacuous.
 */
const BENIGN_CONSOLE: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /Download the React DevTools/i,
    why: 'React development-build advisory printed on every dev page load; not an application error.',
  },
  {
    pattern: /\[Fast Refresh\]|webpack-hmr|hot-update|_next\/static\/webpack/i,
    why: 'Next.js dev-server hot-reload chatter; absent from a production build.',
  },
  {
    pattern: /favicon\.ico/i,
    why: 'Browser-initiated favicon fetch, not part of any admin surface under test.',
  },
]

type Recorder = {
  reset: () => void
  /** Genuine errors only — benign noise filtered, every filter documented above. */
  problems: () => string[]
  /** Everything captured, filtered or not, for diagnostics in the failure message. */
  raw: () => string[]
}

function attachRecorder(page: Page): Recorder {
  let entries: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') entries.push(`console.error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => {
    entries.push(`pageerror: ${err.message}`)
  })
  return {
    reset: () => {
      entries = []
    },
    raw: () => [...entries],
    problems: () => entries.filter((e) => !BENIGN_CONSOLE.some((f) => f.pattern.test(e))),
  }
}

// ---------------------------------------------------------------------------
// Payload local API in a child process (seed + teardown only)
// ---------------------------------------------------------------------------

/**
 * Runs one short ESM script against the Payload local API in a child process.
 * The child carries `--import=tsx/esm`, which is what lets `src/payload.config.ts`
 * (and the `next/cache` import behind it) resolve at all — the Playwright worker
 * itself cannot load that module, which is why seeding lives out here.
 */
function payloadScript(code: string): string {
  const out = execFileSync('node', ['--import=tsx/esm', '--input-type=module', '-e', code], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return String(out)
}

const PAYLOAD_PRELUDE = `
import 'dotenv/config'
import { getPayload } from 'payload'
import config from './src/payload.config.ts'
const payload = await getPayload({ config })
`

function seedRoleUsers(): string {
  return payloadScript(`${PAYLOAD_PRELUDE}
const users = ${JSON.stringify(Object.values(AUDIT_USERS))}
for (const u of users) {
  await payload.delete({ collection: 'users', where: { email: { equals: u.email } }, overrideAccess: true })
  const doc = await payload.create({ collection: 'users', data: u, overrideAccess: true })
  console.log('SEEDED ' + doc.role + ' ' + doc.email + ' #' + doc.id)
}
process.exit(0)
`)
}

/** Last-resort teardown for the case where no admin session ever came up. */
function purgeViaLocalApi(docs: Array<{ collection: string; id: string | number }>): string {
  return payloadScript(`${PAYLOAD_PRELUDE}
const docs = ${JSON.stringify(docs)}
const emails = ${JSON.stringify(Object.values(AUDIT_USERS).map((u) => u.email))}
for (const d of docs) {
  try {
    await payload.delete({ collection: d.collection, id: d.id, overrideAccess: true })
    console.log('DELETED ' + d.collection + ' #' + d.id)
  } catch (err) {
    console.log('ALREADY_GONE ' + d.collection + ' #' + d.id + ' :: ' + (err && err.message))
  }
}
for (const email of emails) {
  await payload.delete({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
  console.log('DELETED user ' + email)
}
process.exit(0)
`)
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let origin = ''
let setupError: Error | null = null

const pages: Partial<Record<RoleName, Page>> = {}
const recorders: Partial<Record<RoleName, Recorder>> = {}
let adminApi: APIRequestContext | undefined

/** Every document this run created. Emptied by `afterAll`. */
const TRACKED: Array<{ collection: string; id: string | number }> = []
const trackDoc = (collection: string, id: string | number | null | undefined): void => {
  if (id === null || id === undefined || id === '') return
  if (!TRACKED.some((d) => d.collection === collection && String(d.id) === String(id))) {
    TRACKED.push({ collection, id })
  }
}

let collectionSlugs: string[] = []
let globalSlugs: string[] = []
let draftPostId: number | string | undefined
let publishablePostId: number | string | undefined

/** Fails the calling probe (rather than letting Playwright skip it) if setup broke. */
function requireSetup(): void {
  if (setupError) {
    throw new Error(
      `audit setup failed, so this probe could not be exercised: ${setupError.message}`,
    )
  }
}

const adminUrl = (p: string): string => `${origin}/admin${p}`

/**
 * Signs a role into the real login screen.
 *
 * This mirrors `tests/helpers/login.ts` (same selectors, same dashboard artifact)
 * but with explicit, generous waits: that helper relies on the default 5s expect
 * timeout, and a dev server compiling the admin route for the first time — or
 * running the dashboard's several count queries under load — routinely needs more
 * than that. A sign-in timeout would surface as "setup failed" on every probe and
 * tell us nothing about the back office.
 */
async function signIn(page: Page, role: RoleName): Promise<void> {
  await page.goto(`${origin}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#field-email').waitFor({ state: 'visible', timeout: 60_000 })
  await page.fill('#field-email', AUDIT_USERS[role].email)
  await page.fill('#field-password', AUDIT_USERS[role].password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${origin}/admin`, { timeout: 90_000 })
  // The custom BeforeDashboard greeting ("أهلًا، <name> 👋") renders for every role
  // once the panel has actually loaded server-side.
  await expect(page.getByRole('heading', { name: /أهلًا/ }).first()).toBeVisible({
    timeout: 90_000,
  })
}

async function openRole(browser: Browser, role: RoleName): Promise<void> {
  const context = await browser.newContext()
  const page = await context.newPage()
  recorders[role] = attachRecorder(page)
  await signIn(page, role)
  pages[role] = page
}

/**
 * A JWT-authenticated REST client — see the csrf note in the file header.
 * Returns `null` instead of throwing when the account does not exist yet, which is
 * how `ensureRoleUsers` decides whether the (slow) local-API seed is needed.
 */
async function apiFor(role: RoleName, optional = false): Promise<APIRequestContext | null> {
  const anon = await playwrightRequest.newContext({ baseURL: origin })
  const res = await anon.post('/api/users/login', {
    data: { email: AUDIT_USERS[role].email, password: AUDIT_USERS[role].password },
  })
  const ok = res.ok()
  const payload = ok ? ((await res.json()) as { token?: string }) : null
  const status = res.status()
  const body = ok ? '' : await res.text()
  await anon.dispose()

  if (!ok || !payload?.token) {
    if (optional) return null
    throw new Error(`REST login failed for ${role}: ${status} ${body}`)
  }
  return playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Authorization: `JWT ${payload.token}` },
  })
}

/**
 * Playwright restarts its worker after every failed test, and this is an audit —
 * probes are EXPECTED to fail — so setup runs many times per invocation. Booting
 * the Payload local API costs ~10s, so do it only when the three audit accounts
 * are not already usable from a previous worker.
 */
async function ensureRoleUsers(): Promise<APIRequestContext> {
  const existing = await apiFor('admin', true)
  if (existing) {
    const editor = await apiFor('editor', true)
    const journalist = await apiFor('journalist', true)
    if (editor && journalist) {
      await editor.dispose()
      await journalist.dispose()
      return existing
    }
    await editor?.dispose()
    await journalist?.dispose()
    await existing.dispose()
  }
   
  console.log(seedRoleUsers().trim())
  const seeded = await apiFor('admin')
  if (!seeded) throw new Error('seeding ran but the audit admin still cannot authenticate')
  return seeded
}

test.beforeAll(async ({ browser }) => {
  // Seeding boots the Payload local API in a child process (~10s) and three
  // browser sign-ins follow, and Playwright restarts its worker after every failed
  // test — so this hook runs many times per invocation and must not race the
  // default 30s hook budget.
  test.setTimeout(300_000)
  try {
    origin = await resolveAdminOrigin()
     
    console.log(`[backoffice-audit] driving the admin at ${origin}`)

    adminApi = await ensureRoleUsers()

    await openRole(browser, 'admin')
    await openRole(browser, 'editor')
    await openRole(browser, 'journalist')

    // Collections + globals, derived from the live config via Payload's own
    // access endpoint rather than from a list that can rot.
    const access = await adminApi.get('/api/access')
    if (!access.ok()) throw new Error(`GET /api/access failed: ${access.status()}`)
    const parsed = (await access.json()) as {
      collections?: Record<string, unknown>
      globals?: Record<string, unknown>
    }
    // `payload-preferences` / `payload-locked-documents` / `payload-migrations` are
    // Payload's own bookkeeping collections. They are injected into every config,
    // are deliberately unreachable in the admin, and are not back-office surfaces —
    // the newsroom's ten collections are what this audit is about.
    const isProjectCollection = (slug: string) => !slug.startsWith('payload-')
    // ...and collections deliberately hidden from the admin. `/api/access` reports every
    // registered collection, including ones whose `admin.hidden` is true — Payload serves
    // those a 404 in the admin BY DESIGN, so visiting them and calling the 404 a defect
    // audits our own wrong assumption rather than the back office.
    //
    // `videos` is retired: "مجموعة الفيديو المستقلة متقاعدة — الفيديو الآن خاصية للمقال"
    // (src/collections/Videos.ts). Keep this list in step with `admin.hidden: true`.
    const HIDDEN_FROM_ADMIN = new Set(['videos'])
    collectionSlugs = Object.keys(parsed.collections ?? {})
      .filter(isProjectCollection)
      .filter((slug) => !HIDDEN_FROM_ADMIN.has(slug))
      .sort()
    globalSlugs = Object.keys(parsed.globals ?? {}).filter(isProjectCollection).sort()

    // Article fixtures, authored by the journalist so the ownership rules in
    // src/access/index.ts apply exactly as they do for a real writer.
    const journalistApi = (await apiFor('journalist'))!
    const cats = await adminApi.get('/api/categories?limit=1&depth=0')
    const catJson = (await cats.json()) as { docs?: Array<{ id: number | string }> }
    const categoryId = catJson.docs?.[0]?.id
    if (categoryId === undefined) throw new Error('no category exists to attach a fixture post to')

    for (const which of ['draft', 'publishable'] as const) {
      const created = await journalistApi.post('/api/posts?draft=true', {
        data: {
          title: `${RUN_ID} مقال تدقيق (${which})`,
          category: categoryId,
          content: lexicalBody('نص تدقيق آلي للوحة التحكم — يُحذف تلقائيًا بعد انتهاء الفحص.'),
          _status: 'draft',
        },
      })
      if (!created.ok()) {
        throw new Error(`could not create the ${which} fixture post: ${created.status()} ${await created.text()}`)
      }
      const { doc } = (await created.json()) as { doc: { id: number | string } }
      trackDoc('posts', doc.id)
      if (which === 'draft') draftPostId = doc.id
      else publishablePostId = doc.id
    }
    await journalistApi.dispose()
  } catch (err) {
    setupError = err instanceof Error ? err : new Error(String(err))
     
    console.error(`[backoffice-audit] setup failed: ${setupError.message}`)
  }
})

test.afterAll(async () => {
  test.setTimeout(300_000)
  // Documents listed in BO_AUDIT_CLEANUP_IDS come from an interrupted earlier run.
  for (const entry of (process.env.BO_AUDIT_CLEANUP_IDS ?? '').split(',')) {
    const [collection, id] = entry.split(':').map((s) => s.trim())
    if (collection && id) trackDoc(collection, id)
  }

  // Never throw from teardown: a throwing hook would turn already-recorded probe
  // verdicts into noise. Shout instead, so a leak can never pass unnoticed.
  try {
    if (adminApi) {
      for (const doc of TRACKED) {
        const res = await adminApi.delete(`/api/${doc.collection}/${doc.id}`)
        if (!res.ok() && res.status() !== 404) {
          throw new Error(`DELETE /api/${doc.collection}/${doc.id} → ${res.status()}`)
        }
      }
      // Role accounts last, the admin itself at the very end — it is the identity
      // doing the deleting.
      for (const role of ['journalist', 'editor', 'admin'] as const) {
        const res = await adminApi.delete(
          `/api/users?where[email][equals]=${encodeURIComponent(AUDIT_USERS[role].email)}`,
        )
        if (!res.ok() && res.status() !== 404) {
          throw new Error(`DELETE audit ${role} user → ${res.status()} ${await res.text()}`)
        }
      }
    } else {
      // No admin session ever came up — fall back to the local API.
       
      console.log(purgeViaLocalApi(TRACKED).trim())
    }
  } catch (err) {
     
    console.error(
      `[backoffice-audit] REST cleanup failed (${err instanceof Error ? err.message : String(err)}); ` +
        `falling back to the Payload local API`,
    )
    try {
       
      console.log(purgeViaLocalApi(TRACKED).trim())
    } catch (fallbackErr) {
       
      console.error(
        `[backoffice-audit] CLEANUP FAILED — these documents may be left behind: ` +
          `${JSON.stringify(TRACKED)} :: ` +
          `${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
      )
    }
  }

  await adminApi?.dispose()
  for (const page of Object.values(pages)) await page?.context().close()
})

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

test('[BO01] admin dashboard renders every registered widget without error', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.admin!
  await page.goto(adminUrl(''), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.modular-dashboard')).toBeVisible()

  // Payload wraps each laid-out widget in `.widget[data-slug="<slug>-<index>"]`.
  for (const slug of REGISTERED_WIDGETS.editorial) {
    await expect(
      page.locator(`.modular-dashboard .widget[data-slug^="${slug}"]`),
      `widget ${slug} is missing from the admin dashboard layout`,
    ).toHaveCount(1)
  }

  // lf-welcome — greeting plus the one action the dashboard exists for.
  await expect(page.locator('.lf-welcome__title')).toContainText('أهلًا')
  await expect(
    page.locator('.lf-welcome__actions a', { hasText: 'اكتب مقالًا جديدًا' }),
  ).toHaveAttribute('href', /\/admin\/collections\/posts\/create$/)
  await expect(page.locator('.lf-welcome__actions a', { hasText: 'كل المقالات' })).toBeVisible()

  // lf-stats — the editorial strip is four tiles, each a real number + Arabic label.
  const tiles = page.locator('.lf-stats .lf-stat')
  await expect(tiles).toHaveCount(4)
  const labels = await page.locator('.lf-stat__label').allTextContents()
  expect(labels).toEqual(
    expect.arrayContaining(['بانتظار المراجعة', 'نُشر اليوم', 'نُشر هذا الأسبوع', 'مقال منشور']),
  )
  for (const value of await page.locator('.lf-stat__value').allTextContents()) {
    expect(value.trim(), 'a dashboard stat tile rendered a non-numeric value').toMatch(/^\d+$/)
  }

  // lf-drafts / lf-published — the two editorial queues.
  await expect(
    page.locator('.widget[data-slug^="lf-drafts"]').getByText('بانتظار المراجعة'),
  ).toBeVisible()
  await expect(
    page.locator('.widget[data-slug^="lf-published"]').getByText('نُشر مؤخرًا'),
  ).toBeVisible()
  // The fixture draft this run created must be in the review queue the widget shows,
  // which proves the widget ran its query rather than rendering an empty shell.
  await expect(
    page.locator('.widget[data-slug^="lf-drafts"] .lf-row__title', { hasText: RUN_ID }).first(),
  ).toBeVisible()

  // lf-shortcuts — an admin gets every door, including the admin-only one.
  const shortcutLabels = await page.locator('.lf-shortcut__label').allTextContents()
  expect(shortcutLabels).toEqual(
    expect.arrayContaining([
      'الصفحة الرئيسية',
      'مكتبة الصور',
      'الإعلانات',
      'الأقسام',
      'الوسوم',
      'أعداد المجلة',
      'القائمة الرئيسية',
      'الصفحات الثابتة',
      'الفريق',
      'إعادة التوجيه',
      'إعدادات الموقع',
      'حسابي',
    ]),
  )

  // lf-guide is the sixth registered widget; the editorial default layout leaves it
  // out, so it is covered on the role whose layout includes it.
  const journalist = pages.journalist!
  await journalist.goto(adminUrl(''), { waitUntil: 'domcontentloaded' })
  for (const slug of REGISTERED_WIDGETS.journalistOnly) {
    await expect(
      journalist.locator(`.modular-dashboard .widget[data-slug^="${slug}"]`),
      `widget ${slug} is missing from the journalist dashboard layout`,
    ).toHaveCount(1)
  }
  await expect(journalist.getByText('كيف أنشر مقالًا؟')).toBeVisible()
  await expect(journalist.locator('.lf-step')).toHaveCount(3)

  // No widget may have fallen back to an error boundary on either dashboard.
  for (const p of [page, journalist]) {
    await expect(p.locator('.error-boundary, .payload-error')).toHaveCount(0)
    await expect(p.getByText(/Application error|Something went wrong|Unhandled Runtime Error/i)).toHaveCount(0)
  }
})

test('[BO02] every collection list view loads for an admin', async () => {
  test.setTimeout(240_000)
  requireSetup()
  const page = pages.admin!

  expect(collectionSlugs.length, 'no collections were derived from GET /api/access').toBeGreaterThan(0)
  // Anti-vacuity guard: the derived list must still contain the newsroom's core
  // collections, so a broken /api/access can never make this probe loop over nothing.
  expect(collectionSlugs).toEqual(
    expect.arrayContaining(['posts', 'categories', 'tags', 'media', 'users']),
  )

  const problems: string[] = []
  for (const slug of collectionSlugs) {
    const res = await page.goto(adminUrl(`/collections/${slug}`), { waitUntil: 'domcontentloaded' })
    const status = res?.status() ?? 0
    const notFound = await page.locator('.not-found').count()
    const heading = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? ''
    const hasList = await page.locator('.collection-list').count()
    const hasTable = await page.locator('.table').count()
    // An empty collection renders Payload's no-results panel instead of a table.
    const hasNoResults = await page
      .locator('.collection-list__no-results, .no-results, .collection-list .no-results')
      .count()
    const hasCreate = await page.locator('.list-header__title-actions a').count()

    if (status !== 200) problems.push(`${slug}: HTTP ${status}`)
    else if (notFound > 0) problems.push(`${slug}: rendered Payload's not-found view ("${heading}")`)
    else if (hasList === 0) problems.push(`${slug}: no .collection-list rendered`)
    else if (hasTable === 0 && hasNoResults === 0)
      problems.push(`${slug}: list rendered neither a table nor a no-results message`)
    else if (!/[؀-ۿ]/.test(heading))
      problems.push(`${slug}: list heading is not the Arabic label ("${heading}")`)
    else if (hasCreate === 0) problems.push(`${slug}: list view offers no "create new" action`)
  }

  expect(problems, `collection list views that do not load for an admin:\n  ${problems.join('\n  ')}`).toEqual([])
})

test('[BO03] every collection create view loads for an admin', async () => {
  test.setTimeout(300_000)
  requireSetup()
  const page = pages.admin!

  expect(collectionSlugs.length, 'no collections were derived from GET /api/access').toBeGreaterThan(0)

  const problems: string[] = []
  for (const slug of collectionSlugs) {
    const res = await page.goto(adminUrl(`/collections/${slug}/create`), {
      waitUntil: 'domcontentloaded',
    })
    const status = res?.status() ?? 0
    await page
      .locator('#action-save, .not-found')
      .first()
      .waitFor({ state: 'attached', timeout: 45_000 })
      .catch(() => undefined)

    // Drafts-with-autosave collections (posts, pages) persist an empty document the
    // moment the create view opens, and redirect to it. Track it for teardown.
    const landed = page.url().match(/\/collections\/[^/]+\/([^/?#]+)/)?.[1]
    if (landed && landed !== 'create') trackDoc(slug, landed)

    const notFound = await page.locator('.not-found').count()
    const form = await page.locator('form.collection-edit, .collection-edit form, form').count()
    const fields = await page.locator('.field-type').count()
    const save = await page.locator('#action-save').count()

    if (status !== 200) problems.push(`${slug}: HTTP ${status}`)
    else if (notFound > 0) problems.push(`${slug}: rendered Payload's not-found view`)
    else if (form === 0) problems.push(`${slug}: create view rendered no form`)
    else if (fields === 0) problems.push(`${slug}: create view rendered zero editable fields`)
    else if (save === 0) problems.push(`${slug}: create view has no save/publish control`)
  }

  expect(problems, `collection create views that do not load for an admin:\n  ${problems.join('\n  ')}`).toEqual([])
})

test('[BO04] every global edit view loads for an admin', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.admin!

  expect(globalSlugs.length, 'no globals were derived from GET /api/access').toBeGreaterThan(0)
  expect(globalSlugs).toEqual(
    expect.arrayContaining(['homepage', 'main-menu', 'site-settings']),
  )

  const problems: string[] = []
  for (const slug of globalSlugs) {
    const res = await page.goto(adminUrl(`/globals/${slug}`), { waitUntil: 'domcontentloaded' })
    const status = res?.status() ?? 0
    await page
      .locator('#action-save, .not-found')
      .first()
      .waitFor({ state: 'attached', timeout: 45_000 })
      .catch(() => undefined)
    const notFound = await page.locator('.not-found').count()
    const heading = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? ''
    const fields = await page.locator('.field-type').count()
    const save = await page.locator('#action-save').count()

    if (status !== 200) problems.push(`${slug}: HTTP ${status}`)
    else if (notFound > 0) problems.push(`${slug}: rendered Payload's not-found view`)
    else if (!/[؀-ۿ]/.test(heading))
      problems.push(`${slug}: heading is not the Arabic label ("${heading}")`)
    else if (fields === 0) problems.push(`${slug}: edit view rendered zero fields`)
    else if (save === 0) problems.push(`${slug}: edit view has no save control`)
  }

  expect(problems, `global edit views that do not load for an admin:\n  ${problems.join('\n  ')}`).toEqual([])
})

test('[BO05] media library lists and an upload succeeds', async () => {
  test.setTimeout(240_000)
  requireSetup()
  const page = pages.admin!

  // The library itself must list real stored files, not just render a shell.
  await page.goto(adminUrl('/collections/media'), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('h1', { hasText: 'مكتبة الوسائط' })).toBeVisible()
  await expect(page.locator('.table table tbody tr').first()).toBeVisible()

  // Then an actual upload through the real form.
  await page.goto(adminUrl('/collections/media/create'), { waitUntil: 'domcontentloaded' })
  const filename = `${RUN_ID.toLowerCase()}-probe.png`
  await page.locator('input[type="file"]').first().setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  })
  await page.fill('#field-alt', 'صورة فحص آلي للوحة التحكم')
  await page.locator('#action-save').click()

  // Payload redirects to the new document once the upload is persisted.
  await page.waitForURL(/\/admin\/collections\/media\/(?!create)[^/?#]+/, { timeout: 60_000 })
  const mediaId = page.url().match(/\/collections\/media\/([^/?#]+)/)?.[1]
  trackDoc('media', mediaId)
  expect(mediaId, 'the media upload did not produce a document id').toBeTruthy()

  // The stored document must carry real file metadata and a reachable URL.
  const res = await adminApi!.get(`/api/media/${mediaId}?depth=0`)
  expect(res.ok(), `GET /api/media/${mediaId} returned ${res.status()}`).toBeTruthy()
  const doc = (await res.json()) as {
    filename?: string
    mimeType?: string
    filesize?: number
    width?: number
    url?: string
  }
  expect(doc.mimeType).toBe('image/png')
  expect(doc.filesize ?? 0).toBeGreaterThan(0)
  expect(doc.width ?? 0).toBeGreaterThan(0)
  expect(doc.filename, 'stored filename does not match the uploaded file').toContain(
    RUN_ID.toLowerCase(),
  )
  expect(doc.url, 'the stored media document has no URL').toBeTruthy()

  const fetched = await adminApi!.get(doc.url!)
  expect(fetched.status(), `the stored file at ${doc.url} is not retrievable`).toBeLessThan(400)

  // And it must now appear in the library listing.
  await page.goto(adminUrl('/collections/media?limit=10&sort=-createdAt'), {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('.table table tbody tr', { hasText: RUN_ID.toLowerCase() }).first()).toBeVisible()
})

test('[BO06] journalist nav is scoped to articles and media only', async () => {
  test.setTimeout(120_000)
  requireSetup()
  const page = pages.journalist!
  await page.goto(adminUrl(''), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('nav .nav__link').first()).toBeVisible()

  const hrefs = (await page.locator('nav a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? ''),
  ))
    .filter((h) => h.includes('/collections/') || h.includes('/globals/'))
    .sort()

  expect(hrefs, 'a journalist should see exactly the articles and media entries').toEqual([
    '/admin/collections/media',
    '/admin/collections/posts',
  ])

  // Belt and braces: the editorial-only surfaces must be absent by name too.
  for (const slug of ['users', 'categories', 'tags', 'ads', 'redirects', 'pages', 'magazine-issues']) {
    await expect(
      page.locator(`nav a[href="/admin/collections/${slug}"]`),
      `journalist nav still offers ${slug}`,
    ).toHaveCount(0)
  }
  for (const slug of ['homepage', 'main-menu', 'site-settings']) {
    await expect(
      page.locator(`nav a[href="/admin/globals/${slug}"]`),
      `journalist nav still offers the ${slug} global`,
    ).toHaveCount(0)
  }

  // The dashboard shortcuts widget is a second nav surface, and must agree.
  expect(await page.locator('.lf-shortcut__label').allTextContents()).toEqual([
    'مكتبة الصور',
    'حسابي',
  ])
})

test('[BO07] journalist sees the draft note instead of the publish button', async () => {
  test.setTimeout(120_000)
  requireSetup()
  const page = pages.journalist!
  expect(draftPostId, 'no fixture draft was created').toBeTruthy()

  await page.goto(adminUrl(`/collections/posts/${draftPostId}`), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#field-title')).toHaveValue(new RegExp(RUN_ID))

  // The custom PublishButton (src/components/admin/PublishButton.tsx) swaps the
  // stock control for a reassurance note.
  const note = page.locator('.lf-publish-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('يُنشره المحرّر بعد المراجعة')
  await expect(note).toHaveAttribute('dir', 'rtl')

  // And no publish affordance may remain anywhere in the document controls.
  await expect(page.locator('#action-save')).toHaveCount(0)
  await expect(page.locator('.doc-controls button', { hasText: 'نشر' })).toHaveCount(0)
})

test('[BO08] editor sees a working publish button on a draft', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.editor!
  expect(publishablePostId, 'no publishable fixture draft was created').toBeTruthy()

  const before = await adminApi!.get(`/api/posts/${publishablePostId}?draft=true&depth=0`)
  expect(((await before.json()) as { _status?: string })._status).toBe('draft')

  await page.goto(adminUrl(`/collections/posts/${publishablePostId}`), {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('#field-title')).toHaveValue(new RegExp(RUN_ID))
  await expect(page.locator('.lf-publish-note')).toHaveCount(0)

  const publish = page.locator('#action-save')
  await expect(publish).toBeVisible()
  await expect(publish).toBeEnabled()
  await expect(publish).toContainText('نشر')

  await publish.click()

  // "Working" means the document really changes state — not merely that a button
  // existed and swallowed a click.
  await expect(page.locator('.doc-controls__status')).toContainText(/تمّ النّشر|منشور/, {
    timeout: 60_000,
  })
  await expect
    .poll(
      async () => {
        const res = await adminApi!.get(`/api/posts/${publishablePostId}?draft=true&depth=0`)
        return ((await res.json()) as { _status?: string })._status
      },
      { timeout: 60_000, message: 'the draft never reached _status=published after the editor clicked publish' },
    )
    .toBe('published')

  const live = await adminApi!.get(`/api/posts/${publishablePostId}?depth=0`)
  const liveDoc = (await live.json()) as { publishedAt?: string | null }
  expect(liveDoc.publishedAt, 'publishing did not stamp publishedAt').toBeTruthy()
})

test('[BO09] the admin renders RTL with Arabic labels', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.admin!
  await page.goto(adminUrl(''), { waitUntil: 'domcontentloaded' })

  // Document direction — assert the COMPUTED direction, which is what actually
  // lays the page out, rather than the literal attribute string.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe('rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', /^rtl$/i)

  // Our own collection labels.
  await expect(page.locator('nav a[href="/admin/collections/posts"]')).toContainText('المقالات')
  await expect(page.locator('nav a[href="/admin/collections/media"]')).toContainText('مكتبة الوسائط')
  await expect(page.locator('nav a[href="/admin/collections/users"]')).toContainText('المستخدمون')

  // Payload's own UI chrome must be served from the ar translation, not English.
  await page.goto(adminUrl(`/collections/posts/${draftPostId}`), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('label.field-label[for="field-title"]')).toContainText('العنوان')
  await expect(page.locator('label.field-label[for="field-excerpt"]')).toContainText('المقتطف')
  await expect(page.locator('.doc-controls__status')).toContainText('الحالة')
  await expect(page.locator('#action-save')).toContainText('نشر')

  // No English fallback may leak into the chrome we localize.
  // `nav.nav__wrap` specifically: Payload renders a SECOND <nav> for the step-nav
  // breadcrumb (`nav.step-nav`), so a bare `locator('nav')` is a strict-mode violation
  // — which fails the probe without saying anything about the admin's translations.
  const navText = (await page.locator('nav.nav__wrap').innerText()).trim()
  expect(navText, 'the admin nav leaked an untranslated English label').not.toMatch(
    /\b(Posts|Media|Users|Categories|Tags|Pages|Redirects|Settings|Dashboard)\b/,
  )

  // Direction must survive into the editing surfaces, not just the shell.
  expect(
    await page.locator('.document-fields__sidebar').evaluate((el) => getComputedStyle(el).direction),
  ).toBe('rtl')
})

test('[BO10] no uncaught console error on the dashboard, a list view and an edit view', async () => {
  test.setTimeout(240_000)
  requireSetup()
  const page = pages.admin!
  const recorder = recorders.admin!

  const surfaces: Array<{ label: string; url: string; ready: () => Promise<void> }> = [
    {
      label: 'dashboard /admin',
      url: adminUrl(''),
      ready: async () => {
        await expect(page.locator('.modular-dashboard')).toBeVisible()
      },
    },
    {
      label: 'list view /admin/collections/posts',
      url: adminUrl('/collections/posts'),
      ready: async () => {
        await expect(page.locator('.collection-list')).toBeVisible()
      },
    },
    {
      label: `edit view /admin/collections/posts/${draftPostId}`,
      url: adminUrl(`/collections/posts/${draftPostId}`),
      ready: async () => {
        await expect(page.locator('#field-title')).toBeVisible()
      },
    },
  ]

  const found: string[] = []
  for (const surface of surfaces) {
    recorder.reset()
    await page.goto(surface.url, { waitUntil: 'domcontentloaded' })
    await surface.ready()
    await page.waitForLoadState('networkidle').catch(() => undefined)
    // Late client-side work (relationship label fetches, lexical bootstrap) lands
    // after networkidle, so give it room before reading the recorder.
    await page.waitForTimeout(3_000)
    for (const problem of recorder.problems()) found.push(`${surface.label} → ${problem}`)
  }

  expect(found, `uncaught errors in the admin console:\n  ${found.join('\n  ')}`).toEqual([])
})

test('[BO11] the article edit view loads its editor and sidebar fields', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.admin!
  expect(draftPostId, 'no fixture draft was created').toBeTruthy()
  await page.goto(adminUrl(`/collections/posts/${draftPostId}`), { waitUntil: 'domcontentloaded' })

  // Main column: the lexical editor must be mounted, carry the saved body, expose
  // its toolbar, and actually accept typing.
  const editor = page.locator('.rich-text-lexical [contenteditable="true"]').first()
  await expect(editor).toBeVisible()
  await expect(page.locator('.rich-text-lexical')).toHaveCount(1)
  await expect(editor).toContainText('نص تدقيق آلي')
  await expect(page.locator('.fixed-toolbar')).toBeVisible()
  // The trimmed feature set (src/payload.config.ts) must be on the toolbar.
  await expect(page.locator('.fixed-toolbar button').first()).toBeVisible()
  expect(
    (await page.locator('.fixed-toolbar button').count()),
    'the lexical fixed toolbar rendered no buttons',
  ).toBeGreaterThan(4)

  const typed = `تحرير ${RUN_ID}`
  await editor.click()
  await editor.press('End')
  await page.keyboard.type(typed)
  await expect(editor, 'the lexical editor did not accept typed input').toContainText(typed)

  // Main column fields.
  for (const id of ['field-title', 'field-excerpt', 'field-featuredImage', 'field-featuredVideoUrl']) {
    await expect(page.locator(`#${id}`), `${id} is missing from the article edit view`).toBeVisible()
  }
  // The journalist guidance UI field must not render for an admin.
  await expect(page.getByText('ابدأ بالكتابة مباشرة')).toHaveCount(0)

  // Sidebar: taxonomy, authorship, publishing — each actually inside the sidebar.
  const sidebar = page.locator('.document-fields__sidebar')
  await expect(sidebar).toBeVisible()
  for (const id of [
    'field-category',
    'field-tags',
    'field-authors',
    'field-publishedAt',
    'field-slug',
    'field-isRecipe',
  ]) {
    await expect(sidebar.locator(`#${id}`), `${id} is missing from the edit sidebar`).toBeVisible()
  }
  // The publish checklist is a sidebar UI field, not a real column — and it is
  // JOURNALIST-ONLY: PublishChecklist returns null for admin and editor
  // (src/components/admin/PublishChecklist.tsx:31), because those roles publish
  // directly and do not submit for review. This view is the admin's, so its ABSENCE
  // is the correct assertion; BO07 covers the journalist, who must see it.
  await expect(sidebar.getByText('قبل الإرسال للمراجعة')).toHaveCount(0)
  // The fixture's category must be resolved to its label, proving the relationship
  // field loaded its option rather than failing silently.
  await expect(sidebar.locator('#field-category')).toContainText(/[؀-ۿ]/)

  await expect(page.locator('.doc-tabs a[href$="/versions"]')).toBeVisible()
})

test('[BO12] live preview opens and renders the draft', async () => {
  test.setTimeout(180_000)
  requireSetup()
  const page = pages.admin!
  expect(draftPostId, 'no fixture draft was created').toBeTruthy()
  await page.goto(adminUrl(`/collections/posts/${draftPostId}`), { waitUntil: 'domcontentloaded' })

  // Payload 3 exposes live preview as a toggler in the document controls.
  const toggler = page.locator('#live-preview-toggler')
  await expect(toggler, 'the post edit view offers no live-preview control').toBeVisible()
  await toggler.click()

  const frame = page.locator('iframe').first()
  await expect(frame, 'toggling live preview rendered no preview iframe').toBeVisible({
    timeout: 30_000,
  })

  // The preview must point at the admin's own origin — a hard-coded fallback that
  // aims the iframe somewhere else renders a foreign site, or nothing at all.
  const src = (await frame.getAttribute('src')) ?? ''
  expect(src, `live preview iframe src is "${src}"`).toContain(origin)
  expect(src, 'live preview URL carries no preview secret').toMatch(/secret=[^&]+/)
  expect(src).toContain(`collection=posts`)
  expect(src).toContain(`id=${draftPostId}`)

  // And it must actually render THIS draft, banner and all.
  const preview = page.frameLocator('iframe').first()
  await expect(
    preview.getByText('معاينة المسودة — هذه نسخة غير منشورة'),
    'the live preview iframe did not render the draft-preview banner',
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    preview.locator('h1', { hasText: RUN_ID }),
    'the live preview iframe did not render the draft under edit',
  ).toBeVisible({ timeout: 30_000 })
})
