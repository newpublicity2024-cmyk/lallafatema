/**
 * Playwright global setup: prove the base URL is THIS project before any test runs.
 *
 * WHY. `reuseExistingServer` reuses whatever already listens on the port — it never
 * checks what that is. On a machine running several dev servers (this one has had six),
 * a port collision silently turns the whole suite into a run against a stranger's app,
 * whose 404s then read as this project's defects. That happened here twice, on two
 * different ports.
 *
 * Next 16 also refuses to start a second dev server for the same project directory, so
 * "just boot our own on a free port" is not available while a dev server is already up.
 * Reuse is therefore necessary — and must be verified rather than trusted.
 *
 * `/api/access` is Payload's own config-derived endpoint: it answers anonymously and
 * returns the real collection slugs, so it identifies the app far more reliably than a
 * title or a 200. (The approach is leaf-1.2's, promoted from one spec to the whole suite.)
 */
import type { FullConfig } from '@playwright/test'

const REQUIRED_COLLECTIONS = ['posts', 'media', 'categories', 'users']

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) throw new Error('playwright: no baseURL configured — cannot verify the target app')

  let res: Response
  try {
    res = await fetch(`${baseURL}/api/access`, { redirect: 'follow' })
  } catch (err) {
    throw new Error(
      `playwright: nothing answered at ${baseURL} (${(err as Error).message}).\n` +
        `Start this project's dev server, or set PLAYWRIGHT_PORT to the port it is on.`,
    )
  }
  if (!res.ok) {
    throw new Error(`playwright: ${baseURL}/api/access returned ${res.status} — that is not this project's admin API.`)
  }

  let body: { collections?: Record<string, unknown> }
  try {
    body = (await res.json()) as typeof body
  } catch {
    throw new Error(`playwright: ${baseURL}/api/access did not return JSON — the app at that port is not Payload.`)
  }

  const slugs = Object.keys(body.collections ?? {})
  const missing = REQUIRED_COLLECTIONS.filter((c) => !slugs.includes(c))
  if (missing.length) {
    throw new Error(
      `playwright: the app at ${baseURL} is Payload-shaped but is NOT this project — ` +
        `its collections are [${slugs.join(', ') || 'none'}], missing [${missing.join(', ')}].\n` +
        `Another dev server is squatting that port. Set PLAYWRIGHT_PORT to this project's port.`,
    )
  }

  console.log(`playwright: verified ${baseURL} is this project (${slugs.length} collections).`)
}
