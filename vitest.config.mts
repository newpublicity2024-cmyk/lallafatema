import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts', 'tests/int/**/*.int.spec.tsx'],
    /**
     * Run test FILES one at a time.
     *
     * Vitest parallelises files by default, and ~20 of these integration specs write to
     * the SAME Neon database (dev, prod and every test run share one instance). Several
     * then assert on global state — "returns only published video-posts, newest first"
     * is a whole-collection query another file's fixtures perturb mid-flight.
     *
     * Measured: three consecutive full-suite runs failed on three DIFFERENT sets of
     * tests (PC05; then api/media-upload/video-post), every one of which passed when its
     * file was re-run alone. That is not flakiness to retry around — it is files racing
     * on shared rows, and a suite whose verdict moves between runs cannot support any
     * claim that the publish chain works.
     *
     * This is the fix for PLAN.md D5 hypothesis 5. It is deliberately NOT a retry:
     * retries would hide the next real regression. Serialising costs wall-clock and buys
     * a deterministic verdict.
     */
    fileParallelism: false,
  },
})
