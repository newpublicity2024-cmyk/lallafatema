import { describe, it, expect } from 'vitest'

import { deriveFeaturedType, applyPostDefaults } from '@/hooks/postDefaults'

const doc = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

/** Builds the hook argument shape; only the fields the hook reads are populated. */
const run = (
  data: Record<string, unknown>,
  user: unknown,
  operation = 'create',
  originalDoc?: Record<string, unknown>,
) =>
  applyPostDefaults({
    data,
    req: { user },
    operation,
    originalDoc,
    // Unused by the hook but present on the real signature.
    collection: undefined,
    context: {},
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

  // Autosave fires every ~375ms while the writer types. Without these two rules
  // the excerpt would freeze at whatever the first keystroke produced.
  it('refreshes an excerpt it generated itself as the body grows', () => {
    const previous = { content: doc('بداية'), excerpt: 'بداية' }
    const result = run(
      { content: doc('بداية النص الكامل بعد الكتابة'), excerpt: 'بداية' },
      journalist,
      'update',
      previous,
    )
    expect(result.excerpt).toBe('بداية النص الكامل بعد الكتابة')
  })

  // `data` is the incoming patch, NOT the merged document. A partial write must
  // read through to the stored values rather than treating "absent" as "empty".
  it('does not demote a video post when the patch omits the video URL', () => {
    const stored = { featuredVideoUrl: 'https://youtu.be/abc', featuredType: 'video' }
    const result = run({ title: 'عنوان محدَّث' }, editor, 'update', stored)
    expect(result.featuredType).toBe('video')
  })

  it('demotes to image when the patch explicitly clears the video URL', () => {
    const stored = { featuredVideoUrl: 'https://youtu.be/abc', featuredType: 'video' }
    const result = run({ featuredVideoUrl: '' }, editor, 'update', stored)
    expect(result.featuredType).toBe('image')
  })

  it('does not clobber a stored hand-written excerpt when the patch omits it', () => {
    const stored = { content: doc('نص قديم'), excerpt: 'مقتطف يدوي' }
    const result = run({ content: doc('نص جديد') }, editor, 'update', stored)
    expect(result.excerpt).toBeUndefined()
  })

  it('still refuses to touch a hand-written excerpt when the body changes', () => {
    const previous = { content: doc('بداية'), excerpt: 'مقتطف من تحرير الكاتب' }
    const result = run(
      { content: doc('نص جديد تمامًا'), excerpt: 'مقتطف من تحرير الكاتب' },
      journalist,
      'update',
      previous,
    )
    expect(result.excerpt).toBe('مقتطف من تحرير الكاتب')
  })
})
