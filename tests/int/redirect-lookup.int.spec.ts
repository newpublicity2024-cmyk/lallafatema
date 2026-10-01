import { describe, it, expect } from 'vitest'

import { lookupKeys } from '@/proxy'

/**
 * Regression guard for the legacy WordPress redirect map.
 *
 * The migration stored `from` decoded and slash-suffixed (`/فوندان-الشوكولاتة.../`),
 * while a crawler requests the percent-encoded, slash-stripped form. A plain
 * `map[pathname]` lookup matched neither, so all ~1.5k imported redirects 404'd
 * silently — the whole migrated archive. These tests pin the normalisation that
 * makes both dialects land on the same key.
 */

// A real imported path: the WP slug for the fondant recipe, as stored in Redirects.
const STORED = '/فوندان-الشوكولاتة-بـ6-نكهات-حلوى-واحدة/'

describe('lookupKeys', () => {
  it('matches the stored decoded+slashed key from the encoded, slash-stripped request', () => {
    // What Next hands the proxy after its own trailing-slash 308.
    const incoming = encodeURI(STORED).replace(/\/$/, '')
    expect(lookupKeys(incoming)).toContain(STORED)
  })

  it('matches the stored key when the slashed encoded form arrives directly', () => {
    expect(lookupKeys(encodeURI(STORED))).toContain(STORED)
  })

  it('covers both slash forms for an already-decoded path', () => {
    const keys = lookupKeys('/مشاهير')
    expect(keys).toContain('/مشاهير')
    expect(keys).toContain('/مشاهير/')
  })

  it('covers both slash forms for a plain ASCII path', () => {
    expect(lookupKeys('/old-article-123')).toEqual(
      expect.arrayContaining(['/old-article-123', '/old-article-123/']),
    )
  })

  it('never emits an empty key for the site root', () => {
    expect(lookupKeys('/')).not.toContain('')
    expect(lookupKeys('/').every(Boolean)).toBe(true)
  })

  it('does not throw on a malformed percent-sequence, and still returns the raw form', () => {
    // decodeURIComponent throws on a lone '%' — the raw path must survive regardless.
    expect(() => lookupKeys('/100%-natural')).not.toThrow()
    expect(lookupKeys('/100%-natural')).toContain('/100%-natural')
  })

  it('returns no duplicates', () => {
    const keys = lookupKeys(encodeURI(STORED))
    expect(keys.length).toBe(new Set(keys).size)
  })
})
