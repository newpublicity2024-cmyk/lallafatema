import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { healthDeepCheckRequested } from '@/lib/health'

let saved: string | undefined

beforeEach(() => {
  saved = process.env.HEALTHCHECK_SECRET
  delete process.env.HEALTHCHECK_SECRET
})

afterEach(() => {
  if (saved === undefined) delete process.env.HEALTHCHECK_SECRET
  else process.env.HEALTHCHECK_SECRET = saved
})

describe('healthDeepCheckRequested', () => {
  it('is false when the secret env is unset (even if a value is passed)', () => {
    expect(healthDeepCheckRequested({ deepParam: 'anything', headerSecret: null })).toBe(false)
  })

  it('is false with no inputs when the secret is set', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: null, headerSecret: null })).toBe(false)
  })

  it('is true when the query param matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: 's3cret', headerSecret: null })).toBe(true)
  })

  it('is true when the header matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: null, headerSecret: 's3cret' })).toBe(true)
  })

  it('is false when neither input matches the secret', () => {
    process.env.HEALTHCHECK_SECRET = 's3cret'
    expect(healthDeepCheckRequested({ deepParam: 'wrong', headerSecret: 'nope' })).toBe(false)
  })
})
