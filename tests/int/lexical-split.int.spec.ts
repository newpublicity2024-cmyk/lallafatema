import { describe, it, expect } from 'vitest'

import { cutAfterParagraph, splitAtCuts } from '@/lib/lexical-split'
import type { LexicalNode } from '@/lib/lexical-text'

const text = (t: string): LexicalNode => ({ type: 'text', text: t })
const p = (t: string): LexicalNode => ({ type: 'paragraph', children: t ? [text(t)] : [] })
const heading = (t: string): LexicalNode => ({ type: 'heading', tag: 'h2', children: [text(t)] })
const list = (): LexicalNode => ({
  type: 'list',
  children: [{ type: 'listitem', children: [text('a')] }],
})
const doc = (...children: LexicalNode[]) => ({ root: { type: 'root', direction: 'rtl', children } })

describe('cutAfterParagraph', () => {
  it('cuts after the n-th paragraph that has text', () => {
    expect(cutAfterParagraph(doc(p('1'), p('2'), p('3')), 2)).toBe(2)
  })

  it('does not count empty paragraphs, headings or lists', () => {
    const d = doc(heading('h'), p('1'), p(''), list(), p('2'), p('3'))
    expect(cutAfterParagraph(d, 2)).toBe(5)
  })

  it('returns null when that paragraph is the last block', () => {
    expect(cutAfterParagraph(doc(p('1'), p('2')), 2)).toBeNull()
  })

  it('returns null when the body is shorter, or missing', () => {
    expect(cutAfterParagraph(doc(p('1')), 2)).toBeNull()
    expect(cutAfterParagraph(null, 2)).toBeNull()
    expect(cutAfterParagraph({ root: { type: 'root' } }, 1)).toBeNull()
  })
})

describe('splitAtCuts', () => {
  const d = doc(p('1'), p('2'), list(), p('3'), p('4'))

  it('returns the document itself when there is nothing to cut', () => {
    expect(splitAtCuts(d, [])).toEqual([d])
  })

  it('splits between root children, keeping every block whole and in order', () => {
    const parts = splitAtCuts(d, [2, 4])
    expect(parts).toHaveLength(3)
    expect(parts.map((x) => x?.root?.children?.length)).toEqual([2, 2, 1])
    expect(parts.flatMap((x) => x?.root?.children ?? [])).toEqual(d.root.children)
    // The list travels intact inside one part.
    expect(parts[1]?.root?.children?.[0]).toEqual(list())
  })

  it('keeps the root’s own properties on every part', () => {
    for (const part of splitAtCuts(d, [1])) {
      expect(part?.root?.type).toBe('root')
      expect(part?.root?.direction).toBe('rtl')
    }
  })
})
