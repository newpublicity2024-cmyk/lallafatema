import { describe, it, expect } from 'vitest'
import { createElement, isValidElement } from 'react'
import { render, within } from '@testing-library/react'

import { RichTextBody, alignAll } from '@/components/RichTextBody'

const withVideoBlock = {
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'قبل الفيديو' }] },
      {
        type: 'block',
        fields: {
          blockType: 'videoEmbed',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          caption: 'مقطع من الحفل',
        },
      },
    ],
  },
}

/**
 * A WordPress-imported body: `htmlToLexical` turns every `<br>` into a `linebreak` node, and
 * 168 of the 1,575 published articles contain one.
 */
const withLineBreak = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'السطر الأول' },
          { type: 'linebreak' },
          { type: 'text', text: 'السطر الثاني' },
        ],
      },
    ],
  },
}

// Queries are scoped to each render's own container: this suite has no global
// testing-library cleanup, so document-wide queries would match earlier renders.
describe('RichTextBody', () => {
  it('renders ordinary paragraphs', () => {
    const { container } = render(<RichTextBody data={withVideoBlock} />)
    expect(within(container).getByText('قبل الفيديو')).toBeDefined()
  })

  it('renders a videoEmbed block as a playable facade', () => {
    const { container } = render(<RichTextBody data={withVideoBlock} />)
    expect(within(container).getByRole('button', { name: /تشغيل/ })).toBeDefined()
  })

  /**
   * REGRESSION GUARD for a bug no renderer in this suite can reproduce.
   *
   * Payload ships some converters as a pre-built React ELEMENT rather than a function —
   * `linebreak` is literally `_jsx("br", {})`. `alignAll` used to treat any non-function
   * object as a nested converter map and rebuild it from `Object.entries`, which keeps
   * `$$typeof` (so it still passes `isValidElement`) but silently drops the non-enumerable
   * `ref`, `_debugInfo`, `_debugStack` and `_debugTask`.
   *
   * Production React never reads those, so the live site rendered such articles correctly.
   * Next's RSC serializer DOES read them and refuses — "Attempted to render <br> without
   * development properties" — after which the request hangs rather than returning. Measured:
   * 168 of 1,575 published articles contain a `linebreak` node, so ~11% of the archive could
   * not be opened on a dev server.
   *
   * ASSERTED STRUCTURALLY, on purpose. A rendering test was written first and thrown away: it
   * passed with the bug still in place, because neither `@testing-library/react`
   * (react-dom/client) nor `renderToStaticMarkup` (react-dom/server) performs that check —
   * only the RSC path does, which no unit test here can drive. Identity is the real contract
   * and it fails the moment the element is rebuilt.
   */
  it('passes a pre-built element converter through untouched', () => {
    const linebreak = createElement('br')
    const fn = () => null
    const out = alignAll({ linebreak, paragraph: fn, blocks: { videoEmbed: fn } })

    // The element must be the SAME object, not a copy: a copy loses ref/_debug* and is what
    // broke the dev renderer.
    expect(out.linebreak).toBe(linebreak)
    expect(isValidElement(out.linebreak)).toBe(true)

    // ...while real converters are still wrapped, and nested maps still recursed into.
    expect(typeof out.paragraph).toBe('function')
    expect(out.paragraph).not.toBe(fn)
    expect(typeof (out.blocks as Record<string, unknown>).videoEmbed).toBe('function')
  })

  it('renders the block caption when present', () => {
    const { container } = render(<RichTextBody data={withVideoBlock} />)
    expect(within(container).getByText('مقطع من الحفل')).toBeDefined()
  })

  it('uses the YouTube poster as the video thumbnail', () => {
    const { container } = render(<RichTextBody data={withVideoBlock} />)
    expect(container.querySelector('img[src*="img.youtube.com"]')).not.toBeNull()
  })

  it('renders nothing for a block with no url', () => {
    const broken = {
      root: {
        type: 'root',
        children: [{ type: 'block', fields: { blockType: 'videoEmbed', url: '' } }],
      },
    }
    const { container } = render(<RichTextBody data={broken} />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toBe('')
  })
})
