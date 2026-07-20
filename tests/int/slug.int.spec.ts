import { describe, it, expect } from 'vitest'

import { slugify, isReservedSlug, RESERVED_ROUTE_SLUGS } from '@/fields/slug'

describe('slugify', () => {
  it('preserves Arabic script and strips punctuation', () => {
    expect(slugify('مطبخ لالة فاطمة!')).toBe('مطبخ-لالة-فاطمة')
  })

  it('lowercases and hyphenates Latin', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
  })
})

describe('isReservedSlug', () => {
  it('flags a top-level route segment as reserved', () => {
    expect(isReservedSlug('videos')).toBe(true)
    expect(isReservedSlug('search')).toBe(true)
    expect(isReservedSlug('magazine')).toBe(true)
  })

  it('does NOT reserve the real "video" category slug', () => {
    // /videos is the route; `video` is a legitimate category slug — must stay allowed.
    expect(isReservedSlug('video')).toBe(false)
  })

  it('allows a normal content slug', () => {
    expect(isReservedSlug('celebrities')).toBe(false)
    expect(isReservedSlug('مطبخ')).toBe(false)
  })

  it('honors the extra reserved list (e.g. legal-page slugs for categories)', () => {
    expect(isReservedSlug('about', ['about', 'privacy'])).toBe(true)
    expect(isReservedSlug('about')).toBe(false)
  })

  it('exposes the canonical route-segment list', () => {
    expect(RESERVED_ROUTE_SLUGS).toContain('videos')
    expect(RESERVED_ROUTE_SLUGS).not.toContain('video')
  })
})
