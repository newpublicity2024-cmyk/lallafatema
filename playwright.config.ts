import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * Dedicated e2e port, and NO server reuse.
 *
 * History, because both halves of this matter. The suite used to target :3000 with
 * `reuseExistingServer: true`, which silently reuses WHATEVER already listens there.
 * On this machine that is an unrelated Next 15 app, so every e2e run was driving a
 * foreign site and reporting its 404s as this project's defects.
 *
 * Moving to a "dedicated" port did NOT fix it on its own: the first port chosen was
 * also occupied by a long-running process from another project, so reuse simply
 * pointed at a different stranger. On a machine running many dev servers, ANY fixed
 * port can collide, and `reuseExistingServer: true` turns a collision into a silent
 * wrong-target run rather than an error.
 *
 * So reuse is now OFF. Playwright always boots this project itself and fails loudly
 * if the port is busy — a noisy failure beats a green run against someone else's app.
 * The cost is a cold Next build per run; set PLAYWRIGHT_PORT to move it if 3310 is
 * taken on your machine.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT || 3100)
export const BASE_URL = `http://localhost:${PORT}`

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL for relative `page.goto('/...')`. Prefer relative paths in new specs
       so the port lives in exactly one place. */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    // Reuse is REQUIRED, not merely convenient: Next 16 refuses to start a second dev
    // server for the same project directory, so if one is already up we cannot boot our
    // own. Safety comes from globalSetup below, which proves the target is this project
    // before a single test runs — never from trusting the port.
    reuseExistingServer: true,
    url: BASE_URL,
    timeout: 240_000,
  },
})
