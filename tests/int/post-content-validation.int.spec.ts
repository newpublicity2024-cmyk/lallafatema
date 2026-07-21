import { describe, it, expect } from 'vitest'

import { validateArticleContent } from '@/lib/lexical-text'

const doc = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

describe('validateArticleContent', () => {
  it('accepts an article with text', () => {
    expect(validateArticleContent(doc('نص حقيقي'))).toBe(true)
  })

  it('rejects null and undefined with an Arabic message', () => {
    expect(validateArticleContent(null)).toMatch(/اكتب/)
    expect(validateArticleContent(undefined)).toMatch(/اكتب/)
  })

  it('rejects a document whose only text is whitespace', () => {
    expect(validateArticleContent(doc('   '))).toMatch(/اكتب/)
  })

  it('rejects a document with no children at all', () => {
    expect(validateArticleContent({ root: { type: 'root', children: [] } })).toMatch(/اكتب/)
  })

  it('accepts an article whose only content is an image', () => {
    // A photo essay is legitimate — presence of a media node counts, not just text.
    const photoOnly = {
      root: { type: 'root', children: [{ type: 'upload', relationTo: 'media', value: 1 }] },
    }
    expect(validateArticleContent(photoOnly)).toBe(true)
  })

  it('accepts an article whose only content is a video block', () => {
    const videoOnly = {
      root: {
        type: 'root',
        children: [{ type: 'block', fields: { blockType: 'videoEmbed', url: 'https://x.test/v' } }],
      },
    }
    expect(validateArticleContent(videoOnly)).toBe(true)
  })
})
