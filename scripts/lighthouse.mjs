// Local-only lab measurement. NOT wired into CI (deploy is deferred; measuring a
// real deployment post-cutover beats a synthetic CI runner). Requires a prior
// `pnpm build`. Spawns `next start`, derives a couple of dynamic URLs, runs
// Lighthouse for each route, prints scores, exits 1 if any route misses the bar.
//
// Windows notes (this is a Windows dev box): three targeted deviations from the
// original brief, each guarded so they are also correct on POSIX —
//   1. startServer spawns the local Next binary directly instead of
//      `npx pnpm start`. proc.kill() does not reap a nested
//      npx->pnpm->cross-env->node chain on Windows, which orphans the server on
//      :3000; holding next's own pid lets teardown tree-kill it.
//   2. stopServer uses `taskkill /T /F` on Windows (SIGTERM leaves next's worker
//      tree alive there), SIGTERM elsewhere.
//   3. chrome.kill() is wrapped: chrome-launcher's temp-profile cleanup can throw
//      EPERM on Windows (Chrome hasn't released the dir yet) AFTER the run is
//      done -- swallowing it avoids a false non-zero exit.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const require = createRequire(import.meta.url)
const BASE = 'http://localhost:3000'
const A11Y_MIN = 0.95
const PERF_MIN = 0.9

// Playwright's bundled Chromium (a guaranteed-present devDependency, so we don't
// depend on a system Chrome). `@playwright/test` re-exports the chromium launcher.
async function chromePath() {
  const { chromium } = await import('@playwright/test')
  return chromium.executablePath()
}

function startServer() {
  const nextBin = require.resolve('next/dist/bin/next')
  const proc = spawn(process.execPath, [nextBin, 'start'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  return proc
}

function stopServer(proc) {
  if (!proc || proc.killed) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {}
  } else {
    proc.kill('SIGTERM')
  }
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`server did not come up at ${url}`)
}

async function firstMatch(re) {
  const html = await (await fetch(BASE)).text()
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  const hit = hrefs.find((h) => re.test(h))
  return hit ? new URL(hit, BASE).toString() : null
}

async function run() {
  const server = startServer()
  let failed = false
  try {
    await waitForServer(BASE)
    const routes = [
      BASE,
      `${BASE}/search`,
      `${BASE}/about`,
      `${BASE}/magazine`,
      (await firstMatch(/^\/[^/"]+\/[^/"]+-\d+$/)) ?? null, // an article
      (await firstMatch(/^\/videos\//)) ?? null, // a video watch page
    ].filter(Boolean)

    const chrome = await chromeLauncher.launch({
      chromePath: await chromePath(),
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    })
    console.log('\nroute'.padEnd(60), 'a11y', 'perf')
    try {
      for (const url of routes) {
        const { lhr } = await lighthouse(
          url,
          { port: chrome.port, output: 'json', logLevel: 'error' },
          { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility', 'performance'] } },
        )
        const a11y = lhr.categories.accessibility.score
        const perf = lhr.categories.performance.score
        const ok = a11y >= A11Y_MIN && perf >= PERF_MIN
        if (!ok) failed = true
        console.log(url.replace(BASE, '').padEnd(60) || '/'.padEnd(60), a11y.toFixed(2), perf.toFixed(2), ok ? '' : '  ✗ below bar')
      }
    } finally {
      try {
        await chrome.kill()
      } catch {}
    }
  } finally {
    stopServer(server)
  }
  if (failed) {
    console.error(`\nAt least one route is below the bar (a11y >= ${A11Y_MIN}, perf >= ${PERF_MIN}).`)
    process.exit(1)
  }
  console.log('\nAll measured routes meet the bar.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
