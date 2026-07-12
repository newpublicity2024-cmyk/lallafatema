import * as Sentry from '@sentry/nextjs'

import { sentryEnabled, sentryEnvironment, tracesSampleRate } from '@/lib/observability'

export function register(): void {
  if (!sentryEnabled()) return
  // Runs for both the Node.js and Edge server runtimes; both share the same config.
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: tracesSampleRate(),
      environment: sentryEnvironment(),
    })
  }
}

// Safe no-op when Sentry is uninitialized (no DSN); captures server component /
// route handler errors when enabled.
export const onRequestError = Sentry.captureRequestError
