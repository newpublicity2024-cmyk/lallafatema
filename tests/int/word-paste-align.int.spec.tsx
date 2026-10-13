import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RichTextBody } from '@/components/RichTextBody'
import {
  TOOLBAR_ALIGNMENTS,
  UNSETTABLE_ALIGNMENTS,
  stripUnsettableAlignment,
} from '@/lib/lexical-align'
import type { LexicalNode } from '@/lib/lexical-text'

/**
 * Text alignment: what a journalist sets, what a Word paste leaves behind, and what
 * readers get.
 *
 * TWO THINGS HAVE TO BE TRUE AT ONCE, and they pull in opposite directions.
 *
 * 1. Alignment the journalist chose must reach the reader exactly as the editor showed it.
 *    The editor writes the stored keyword straight into the DOM, so the page does the same
 *    — anything cleverer is a second opinion, and a second opinion is what caused (2).
 *
 * 2. A Word paste must not be able to throw the body to the far left of the page. Word's
 *    clipboard carries `text-align`, Lexical records it, and Payload's converter resolves
 *    the direction-neutral `start` as a physical `left` — which on this `dir="rtl"` site is
 *    the wrong edge, and which looked fine in the editor because CSS resolves `start`
 *    against the paragraph's own direction.
 *
 * What reconciles them is that `AlignFeature` can only ever set PHYSICAL keywords
 * (`left`/`center`/`right`/`justify`). `start`/`end` are unreachable from the toolbar, so
 * they are always residue — stripped on save, and harmless on render because they are
 * emitted as-is and resolve correctly.
 */

afterEach(() => cleanup())

const text = (value: string) => ({
  type: 'text',
  text: value,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const para = (format: string, value = 'أعلنت الفنانة عن ألبومها الجديد') => ({
  type: 'paragraph',
  children: [text(value)],
  direction: 'rtl',
  format,
  indent: 0,
  version: 1,
})

const doc = (...children: LexicalNode[]) => ({
  root: { type: 'root', children, direction: 'rtl', format: '', indent: 0, version: 1 },
})

/** The inline `text-align` on the first paragraph of a rendered body, or null. */
function renderedAlign(data: unknown): string | null {
  const { container } = render(<RichTextBody data={data} className="prose-ar" />)
  const paragraph = container.querySelector('p')
  expect(paragraph).not.toBeNull()
  return paragraph!.style.textAlign || null
}

describe('alignment a journalist sets reaches the reader', () => {
  it.each(TOOLBAR_ALIGNMENTS)('renders a stored %s alignment verbatim', (format) => {
    // Verbatim is the point: this is the same declaration Lexical puts on the node inside
    // the editor, so what she sees while writing is what the page serves.
    expect(renderedAlign(doc(para(format)))).toBe(format)
  })

  it('leaves an unaligned paragraph to follow the page direction', () => {
    expect(renderedAlign(doc(para('')))).toBeNull()
  })

  it('aligns a heading too, not just body paragraphs', () => {
    const { container } = render(
      <RichTextBody
        data={doc({ ...para('center', 'العنوان'), type: 'heading', tag: 'h2' })}
        className="prose-ar"
      />,
    )
    expect(container.querySelector('h2')?.style.textAlign).toBe('center')
  })

  it('does not override a converter that already set its own style', () => {
    // Our own blocks lay themselves out; a stray alignment must not win over that.
    const { container } = render(
      <RichTextBody
        data={doc({
          type: 'block',
          format: 'center',
          version: 1,
          fields: { blockType: 'videoEmbed', url: '', caption: null },
        })}
      />,
    )
    expect(container.innerHTML).not.toContain('unknown node')
  })
})

describe('a Word paste still cannot throw the article to the far left', () => {
  /**
   * The regression guard for #6. `start` is direction-neutral and resolves to the right on
   * Arabic — which is why the editor looked correct — but Payload emitted `text-align:
   * left` for it, putting the whole body on the wrong edge of the page.
   */
  it('never emits text-align:left for the direction-neutral `start`', () => {
    const { container } = render(<RichTextBody data={doc(para('start'))} className="prose-ar" />)
    expect(container.innerHTML).not.toContain('text-align:left')
    expect(container.innerHTML).not.toContain('text-align: left')
  })

  it.each(UNSETTABLE_ALIGNMENTS)('renders a stored %s as the logical keyword, not a side', (format) => {
    // Left as-is so the browser resolves it against the text direction, exactly as the
    // editor does. Rewriting it to a physical side is precisely the upstream bug.
    expect(renderedAlign(doc(para(format)))).toBe(format)
  })

  it.each(UNSETTABLE_ALIGNMENTS)('strips %s on the way into the database', (format) => {
    const stripped = stripUnsettableAlignment(doc(para(format))) as ReturnType<typeof doc>
    expect((stripped.root.children[0] as { format: string }).format).toBe('')
  })

  it.each(TOOLBAR_ALIGNMENTS)('keeps %s on the way into the database', (format) => {
    const stripped = stripUnsettableAlignment(doc(para(format))) as ReturnType<typeof doc>
    expect((stripped.root.children[0] as { format: string }).format).toBe(format)
  })
})

describe('the normaliser leaves everything else alone', () => {
  it('does not touch a text node’s format bitmask', () => {
    // A text node's `format` is a NUMBER of style bits — 1 is bold. Clearing it as if it
    // were an alignment keyword would silently un-bold every emphasised word on the site.
    const bold = { ...text('كلمة'), format: 1 }
    const body = doc({ ...para('start'), children: [bold] })
    const stripped = stripUnsettableAlignment(body) as typeof body
    const paragraph = stripped.root.children[0] as { format: string; children: { format: number }[] }

    expect(paragraph.format).toBe('')
    expect(paragraph.children[0].format).toBe(1)
  })

  it('preserves the text, the node order and the node count', () => {
    const body = doc(para('start', 'أولى'), para('center', 'ثانية'), para('end', 'ثالثة'))
    const stripped = stripUnsettableAlignment(body) as typeof body

    expect(stripped.root.children).toHaveLength(3)
    expect(
      stripped.root.children.map((child) => (child as ReturnType<typeof para>).children[0].text),
    ).toEqual(['أولى', 'ثانية', 'ثالثة'])
  })

  it('strips residue nested inside a list while keeping the journalist’s own alignment', () => {
    const body = doc({
      type: 'list',
      listType: 'bullet',
      tag: 'ul',
      format: 'start',
      direction: 'rtl',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'listitem',
          value: 1,
          format: 'center',
          direction: 'rtl',
          indent: 0,
          version: 1,
          children: [text('بند')],
        },
      ],
    })
    const stripped = stripUnsettableAlignment(body) as typeof body
    const list = stripped.root.children[0] as { format: string; children: { format: string }[] }

    expect(list.format).toBe('')
    expect(list.children[0].format).toBe('center')
  })

  it('returns the identical object when there is nothing to strip, so a save is a no-op', () => {
    const body = doc(para(''), para('center'), para('left'))
    expect(stripUnsettableAlignment(body)).toBe(body)
  })

  it('passes an empty body straight through', () => {
    expect(stripUnsettableAlignment(null)).toBeNull()
    expect(stripUnsettableAlignment(undefined)).toBeUndefined()
    const noRoot = {} as never
    expect(stripUnsettableAlignment(noRoot)).toBe(noRoot)
  })
})
