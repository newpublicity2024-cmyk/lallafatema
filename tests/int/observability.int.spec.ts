import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clientSentryEnabled,
  sentryEnabled,
  sentryEnvironment,
  tracesSampleRate,
} from '@/lib/observability'

const KEYS = [
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_TRACES_SAMPLE_RATE',
  'VERCEL_ENV',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('observability gate (inert without config)', () => {
  it('sentry is disabled when no server DSN', () => {
    expect(sentryEnabled()).toBe(false)
  })

  it('client sentry is disabled when no public DSN', () => {
    expect(clientSentryEnabled()).toBe(false)
  })

  it('sentry enables when the server DSN is set', () => {
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1'
    expect(sentryEnabled()).toBe(true)
  })

  it('client sentry enables when the public DSN is set', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1'
    expect(clientSentryEnabled()).toBe(true)
  })
})

describe('tracesSampleRate', () => {
  it('defaults to 0.1 when unset', () => {
    expect(tracesSampleRate()).toBe(0.1)
  })

  it('reads a valid rate', () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25'
    expect(tracesSampleRate()).toBe(0.25)
  })

  it('falls back to 0.1 for out-of-range or garbage values', () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '2'
    expect(tracesSampleRate()).toBe(0.1)
    process.env.SENTRY_TRACES_SAMPLE_RATE = 'nope'
    expect(tracesSampleRate()).toBe(0.1)
  })
})

describe('sentryEnvironment', () => {
  it('prefers VERCEL_ENV', () => {
    process.env.VERCEL_ENV = 'production'
    expect(sentryEnvironment()).toBe('production')
  })
})
