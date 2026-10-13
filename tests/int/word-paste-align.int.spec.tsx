import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RichTextBody } from '@/components/RichTextBody'
import { SIDE_ALIGNMENTS, stripSideAlignment } from '@/lib/lexical-align'
import type { LexicalNode } from '@/lib/lexical-text'

/**
 * The Word-paste alignment bug, and the two halves of its fix.
 *
 * REPORTED AS: a journalist writes in Word, pastes into the article editor, hits preview,
 * and the whole body is flush to the far left of the page — while the same paragraphs look
 * correctly right-aligned in the editor, and the editor offers no alignment control she
 * could have pressed by accident.
 *
 * MEASURED CAUSE: Word's clipboard HTML carries the paragraph's `text-align`, Lexical's
 * importer stores it, and Payload's Lexical→JSX converter resolves it with hard-coded
 * left-to-right physics — `start` becomes `text-align: left`, which on a `dir="rtl"` page
 * is the far side of the column, and an inline style beats the document direction.
 *
 * So the assertions below are about ONE thing: no alignment value that can arrive by paste
 * may put an inline side alignment on an article paragraph. They are written against the
 * rendered markup rather than against `stripSideAlignment`'s return value, because the
 * markup is what the reader gets.
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

describe('a Word paste cannot push the article body to the far left', () => {
  it.each(SIDE_ALIGNMENTS)('renders a stored %s alignment with no inline side alignment', (format) => {
    expect(renderedAlign(doc(para(format)))).toBeNull()
  })

  it('renders an unaligned paragraph the same way, so the page stays uniform', () => {
    expect(renderedAlign(doc(para('')))).toBeNull()
  })

  /**
   * The one that was actually reaching readers. `start` is direction-neutral in CSS and
   * resolves to the right in Arabic — which is why the editor looked fine — but Payload
   * emitted `text-align: left` for it. This is the regression guard with teeth: if the
   * normalisation is ever removed, this is the assertion that goes red.
   */
  it('never emits text-align:left for the direction-neutral `start`', () => {
    const { container } = render(<RichTextBody data={doc(para('start'))} className="prose-ar" />)
    expect(container.innerHTML).not.toContain('text-align:left')
    expect(container.innerHTML).not.toContain('text-align: left')
  })
})

describe('alignments that are not about a side survive', () => {
  it('keeps a centred paragraph centred', () => {
    expect(renderedAlign(doc(para('center', 'صورة من الحفل')))).toBe('center')
  })

  it('keeps a justified paragraph justified', () => {
    expect(renderedAlign(doc(para('justify')))).toBe('justify')
  })
})

describe('stripSideAlignment leaves everything else alone', () => {
  it('does not touch a text node’s format bitmask', () => {
    // A text node's `format` is a NUMBER of style bits — 1 is bold. Clearing it as if it
    // were an alignment keyword would silently un-bold every emphasised word on the site.
    const bold = { ...text('كلمة'), format: 1 }
    const body = doc({ ...para('start'), children: [bold] })
    const stripped = stripSideAlignment(body) as typeof body
    const paragraph = stripped.root.children[0] as { format: string; children: { format: number }[] }

    expect(paragraph.format).toBe('')
    expect(paragraph.children[0].format).toBe(1)
  })

  it('preserves the text, the node order and the node count', () => {
    const body = doc(para('start', 'أولى'), para('center', 'ثانية'), para('end', 'ثالثة'))
    const stripped = stripSideAlignment(body) as typeof body

    expect(stripped.root.children).toHaveLength(3)
    expect(stripped.root.children.map((child) => (child as ReturnType<typeof para>).children[0].text)).toEqual([
      'أولى',
      'ثانية',
      'ثالثة',
    ])
  })

  it('strips alignment nested inside a list, not just at the top level', () => {
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
          format: 'left',
          direction: 'rtl',
          indent: 0,
          version: 1,
          children: [text('بند')],
        },
      ],
    })
    const stripped = JSON.stringify(stripSideAlignment(body))

    for (const side of SIDE_ALIGNMENTS) {
      expect(stripped).not.toContain(`"format":"${side}"`)
    }
    expect(stripped).toContain('بند')
  })

  it('returns the identical object when there is nothing to strip, so a save is a no-op', () => {
    const body = doc(para(''), para('center'))
    expect(stripSideAlignment(body)).toBe(body)
  })

  it('passes an empty body straight through', () => {
    expect(stripSideAlignment(null)).toBeNull()
    expect(stripSideAlignment(undefined)).toBeUndefined()
    const noRoot = {} as never
    expect(stripSideAlignment(noRoot)).toBe(noRoot)
  })
})
