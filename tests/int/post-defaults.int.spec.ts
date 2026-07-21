import { describe, it, expect } from 'vitest'

import { deriveFeaturedType, applyPostDefaults } from '@/hooks/postDefaults'

const doc = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

/** Builds the hook argument shape; only the fields the hook reads are populated. */
const run = (data: Record<string, unknown>, user: unknown, operation = 'create') =>
  applyPostDefaults({
    data,
    req: { user },
    operation,
    // Unused by the hook but present on the real signature.
    collection: undefined,
    context: {},
    originalDoc: undefined,
  } as never) as Record<string, unknown>

const journalist = { id: 7, role: 'journalist' }
const editor = { id: 2, role: 'editor' }

describe('deriveFeaturedType', () => {
  it('is video when a URL is present', () => {
    expect(deriveFeaturedType('https://youtube.com/watch?v=abc')).toBe('video')
  })

  it('is image for blank, whitespace-only, null and undefined', () => {
    expect(deriveFeaturedType('')).toBe('image')
    expect(deriveFeaturedType('   ')).toBe('image')
    expect(deriveFeaturedType(null)).toBe('image')
    expect(deriveFeaturedType(undefined)).toBe('image')
  })

  it('is image for a non-string value', () => {
    expect(deriveFeaturedType(42)).toBe('image')
  })
})

describe('applyPostDefaults', () => {
  it('blocks a journalist from publishing', () => {
    expect(() => run({ _status: 'published' }, journalist)).toThrow(/غير مسموح/)
  })

  it('allows an editor to publish', () => {
    expect(() => run({ _status: 'published' }, editor)).not.toThrow()
  })

  it('stamps publishedAt on first publish only', () => {
    const fresh = run({ _status: 'published' }, editor)
    expect(fresh.publishedAt).toEqual(expect.any(String))

    const already = run({ _status: 'published', publishedAt: '2020-01-01T00:00:00.000Z' }, editor)
    expect(already.publishedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('defaults authorship to the creating user', () => {
    expect(run({}, journalist).authors).toEqual([7])
  })

  it('does not overwrite authorship that was supplied', () => {
    expect(run({ authors: [99] }, editor).authors).toEqual([99])
  })

  it('does not default authorship on update', () => {
    expect(run({}, journalist, 'update').authors).toBeUndefined()
  })

  it('derives featuredType from the video URL', () => {
    expect(run({ featuredVideoUrl: 'https://vimeo.com/1' }, journalist).featuredType).toBe('video')
    expect(run({ featuredVideoUrl: '' }, journalist).featuredType).toBe('image')
  })

  it('overrides a stale featuredType rather than trusting it', () => {
    const result = run({ featuredType: 'video', featuredVideoUrl: '' }, journalist)
    expect(result.featuredType).toBe('image')
  })

  it('fills a blank excerpt from the content', () => {
    expect(run({ content: doc('نص المقال هنا') }, journalist).excerpt).toBe('نص المقال هنا')
  })

  it('never overwrites an excerpt the writer typed', () => {
    const result = run({ content: doc('نص المقال'), excerpt: 'مقتطف يدوي' }, journalist)
    expect(result.excerpt).toBe('مقتطف يدوي')
  })

  it('treats a whitespace-only excerpt as blank', () => {
    expect(run({ content: doc('نص المقال'), excerpt: '   ' }, journalist).excerpt).toBe('نص المقال')
  })

  it('leaves the excerpt untouched when there is no content', () => {
    expect(run({ title: 'عنوان' }, journalist).excerpt).toBeUndefined()
  })
})
