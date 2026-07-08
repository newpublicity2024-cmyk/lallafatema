import { describe, it, expect, afterEach } from 'vitest'

import { allowedOrigins } from '@/lib/origins'

const ORIGINAL = process.env.NEXT_PUBLIC_SERVER_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = ORIGINAL
})

describe('allowedOrigins', () => {
  it('always includes the canonical origin and never a wildcard', () => {
    delete process.env.NEXT_PUBLIC_SERVER_URL
    const origins = allowedOrigins()
    expect(origins).toContain('https://lallafatema.ma')
    expect(origins).not.toContain('*')
  })

  it('adds NEXT_PUBLIC_SERVER_URL with trailing slash stripped, no duplicates', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000/'
    const origins = allowedOrigins()
    expect(origins).toContain('http://localhost:3000')
    expect(origins.filter((o) => o === 'http://localhost:3000')).toHaveLength(1)
  })

  it('does not duplicate the canonical origin when env equals it', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://lallafatema.ma'
    expect(allowedOrigins().filter((o) => o === 'https://lallafatema.ma')).toHaveLength(1)
  })

  it('never adds a wildcard even when env is literally "*"', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = '*'
    const origins = allowedOrigins()
    expect(origins).not.toContain('*')
    expect(origins).toContain('https://lallafatema.ma')
  })
})
