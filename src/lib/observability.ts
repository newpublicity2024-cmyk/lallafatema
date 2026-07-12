/**
 * Observability gate. Sentry is fully inert until a DSN is provided:
 * these helpers are the single source of truth consumed by the instrumentation
 * files so the enable/disable decision lives in exactly one place.
 */

/** Server + edge error/perf reporting is enabled only when the server DSN is set. */
export function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN)
}

/**
 * Browser error reporting is enabled only when the public DSN is set.
 * `NEXT_PUBLIC_*` is inlined at build time, so activation requires a rebuild.
 */
export function clientSentryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
}

/** Server/API performance trace sample rate; clamped to [0,1], default 0.1. */
export function tracesSampleRate(): number {
  // Trim first so a whitespace-only value falls back to the default rather than
  // coercing to 0 via Number(" ").
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim()
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1
}

/** Deployment environment tag for Sentry events. */
export function sentryEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}
