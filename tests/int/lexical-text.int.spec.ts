import { describe, it, expect } from 'vitest'

import { lexicalToPlainText, deriveExcerpt, EXCERPT_MAX_LENGTH } from '@/lib/lexical-text'

/** Minimal Lexical document builder — mirrors what the editor actually stores. */
const doc = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

describe('lexicalToPlainText', () => {
  it('extracts text from a single paragraph', () => {
    expect(lexicalToPlainText(doc('مرحبا بالعالم'))).toBe('مرحبا بالعالم')
  })

  it('separates paragraphs with a single space', () => {
    expect(lexicalToPlainText(doc('الفقرة الأولى', 'الفقرة الثانية'))).toBe(
      'الفقرة الأولى الفقرة الثانية',
    )
  })

  it('walks arbitrarily nested nodes (lists, quotes, formatted spans)', () => {
    const nested = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            children: [
              {
                type: 'listitem',
                children: [{ type: 'text', text: 'عنصر' }],
              },
            ],
          },
          {
            type: 'quote',
            children: [{ type: 'text', text: 'اقتباس' }],
          },
        ],
      },
    }
    expect(lexicalToPlainText(nested)).toBe('عنصر اقتباس')
  })

  it('ignores nodes that carry no text (uploads, video blocks)', () => {
    const withUpload = {
      root: {
        type: 'root',
        children: [
          { type: 'upload', relationTo: 'media', value: 1 },
          { type: 'block', fields: { blockType: 'videoEmbed', url: 'https://x.test/v' } },
          { type: 'paragraph', children: [{ type: 'text', text: 'نص' }] },
        ],
      },
    }
    expect(lexicalToPlainText(withUpload)).toBe('نص')
  })

  it('collapses runs of whitespace', () => {
    expect(lexicalToPlainText(doc('كلمة    أخرى'))).toBe('كلمة أخرى')
  })

  it('returns an empty string for null, undefined and a rootless object', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText(undefined)).toBe('')
    expect(lexicalToPlainText({})).toBe('')
  })
})

describe('deriveExcerpt', () => {
  it('returns the whole text when it is shorter than the limit', () => {
    expect(deriveExcerpt(doc('مقال قصير'))).toBe('مقال قصير')
  })

  it('truncates at a word boundary and appends an ellipsis', () => {
    const long = 'كلمة '.repeat(60).trim()
    const result = deriveExcerpt(doc(long))

    expect(result.length).toBeLessThanOrEqual(EXCERPT_MAX_LENGTH + 1)
    expect(result.endsWith('…')).toBe(true)
    // Never cuts mid-word: everything before the ellipsis is whole words.
    expect(result.slice(0, -1).trim().endsWith('كلمة')).toBe(true)
  })

  it('strips trailing punctuation before the ellipsis', () => {
    // The comma must land exactly on the cut for this to exercise the strip:
    // 'كلمة كلمة، كلمة' puts it at index 9, and a maxLength of 10 clips right
    // after it. A comma beyond the cut would never reach that branch.
    expect(deriveExcerpt(doc('كلمة كلمة، كلمة'), 10)).toBe('كلمة كلمة…')
  })

  it('cuts mid-token when a single token is longer than the limit', () => {
    // A pasted URL as the whole body: there is no earlier space to fall back to.
    expect(deriveExcerpt(doc('https://example.com/a-very-long-path'), 12)).toBe('https://exam…')
  })

  it('honours a custom maxLength', () => {
    expect(deriveExcerpt(doc('واحد اثنان ثلاثة أربعة'), 10)).toBe('واحد اثنان…')
  })

  it('returns an empty string for empty content', () => {
    expect(deriveExcerpt(null)).toBe('')
    expect(deriveExcerpt(doc(''))).toBe('')
  })
})
