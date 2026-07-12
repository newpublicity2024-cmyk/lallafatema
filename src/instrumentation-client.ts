import * as Sentry from '@sentry/nextjs'

import { clientSentryEnabled, sentryEnvironment } from '@/lib/observability'

// Errors only: no browser performance tracing and no Session Replay (CWV discipline).
if (clientSentryEnabled()) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
