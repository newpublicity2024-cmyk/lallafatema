import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'

import { RichTextBody } from '@/components/RichTextBody'

/**
 * How the article body routes OUR blocks, and how it behaves on stored shapes that are
 * wrong, half-written or from a different deploy.
 *
 * The emphasis is deliberate. Measured across all 1,574 live posts: zero contain a block
 * node and 652 contain an inline `upload` node. So the realistic failure here is not a
 * gallery that renders badly — it is a change to this file that drops a legacy node type and
 * silently guts 652 articles. Every "legacy" case below is therefore an assertion that the
 * DEFAULT converters are still reachable, not that we re-implemented them.
 */

afterEach(() => cleanup())

const text = (t: string) => ({
  type: 'text',
  text: t,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const para = (t: string) => ({
  type: 'paragraph',
  children: [text(t)],
  direction: 'rtl',
  format: '',
  indent: 0,
  version: 1,
})

const doc = (children: unknown[]) => ({
  root: { type: 'root', children, direction: 'rtl', format: '', indent: 0, version: 1 },
})

const mediaDoc = (n: number) => ({
  id: n,
  url: `/media/photo-${n}.jpg`,
  alt: `بديل ${n}`,
  width: 1200,
  height: 800,
  filename: `photo-${n}.jpg`,
  mimeType: 'image/jpeg',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
})

const galleryBlock = (layout: unknown, count: number) => ({
  type: 'block',
  version: 2,
  fields: {
    blockType: 'gallery',
    blockName: '',
    layout,
    images: Array.from({ length: count }, (_, i) => ({
      id: `row-${i}`,
      image: mediaDoc(i + 1),
      caption: `تعليق ${i + 1}`,
      alt: `بديل ${i + 1}`,
    })),
  },
})

const videoBlock = (url: string, caption?: string) => ({
  type: 'block',
  version: 2,
  fields: { blockType: 'videoEmbed', blockName: '', url, ...(caption ? { caption } : {}) },
})

describe('gallery block routing', () => {
  for (const layout of ['mosaic', 'grid', 'carousel'] as const) {
    it(`passes the stored "${layout}" layout through to the renderer`, () => {
      render(<RichTextBody data={doc([galleryBlock(layout, 3)])} />)
      expect(screen.getByTestId('lf-gallery').getAttribute('data-layout')).toBe(layout)
    })
  }

  it('falls back to the mosaic for a layout value this build does not know', () => {
    // Reachable during a rollout: a newer deploy writes a layout the running frontend has
    // never heard of. Picking a sensible layout beats dropping the photos.
    render(<RichTextBody data={doc([galleryBlock('kaleidoscope', 3)])} />)
    expect(screen.getByTestId('lf-gallery').getAttribute('data-layout')).toBe('mosaic')
  })

  it('falls back to the mosaic when no layout was stored at all', () => {
    render(<RichTextBody data={doc([galleryBlock(undefined, 2)])} />)
    expect(screen.getByTestId('lf-gallery').getAttribute('data-layout')).toBe('mosaic')
  })

  it('keeps the per-photo caption and alt from the block row', () => {
    render(<RichTextBody data={doc([galleryBlock('grid', 2)])} />)
    expect(screen.getByText('تعليق 1')).toBeTruthy()
    expect(screen.getByAltText('بديل 2')).toBeTruthy()
  })

  it('renders the surrounding article when the gallery holds no photos', () => {
    const empty = { type: 'block', version: 2, fields: { blockType: 'gallery', blockName: '', layout: 'grid', images: [] } }
    render(<RichTextBody data={doc([para('قبل'), empty, para('بعد')])} />)
    expect(screen.getByText('قبل')).toBeTruthy()
    expect(screen.getByText('بعد')).toBeTruthy()
    expect(screen.queryByTestId('lf-gallery')).toBeNull()
  })

  it('renders the surrounding article when `images` is missing entirely', () => {
    const broken = { type: 'block', version: 2, fields: { blockType: 'gallery', blockName: '' } }
    expect(() => render(<RichTextBody data={doc([para('نص'), broken])} />)).not.toThrow()
    expect(screen.getByText('نص')).toBeTruthy()
  })

  it('caps a 7-photo mosaic at five tiles with the remainder counted', () => {
    render(<RichTextBody data={doc([galleryBlock('mosaic', 7)])} />)
    expect(screen.getAllByTestId('lf-gallery-tile')).toHaveLength(5)
    expect(screen.getByTestId('lf-gallery-overflow').textContent).toBe('+2')
  })
})

describe('videoEmbed block routing', () => {
  it('marks the provider for each supported host', () => {
    const cases: [string, string][] = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
      ['https://vimeo.com/76979871', 'vimeo'],
      ['https://www.dailymotion.com/video/x7tgad0', 'dailymotion'],
      ['https://www.instagram.com/reel/CxAbCdEfGhI/', 'instagram'],
      ['https://www.tiktok.com/@someuser/video/7212345678901234567', 'tiktok'],
      ['https://www.facebook.com/watch/?v=1234567890', 'facebook'],
    ]
    for (const [url, provider] of cases) {
      cleanup()
      render(<RichTextBody data={doc([videoBlock(url)])} />)
      expect(screen.getByTestId('lf-embed').getAttribute('data-provider')).toBe(provider)
    }
  })

  it('strips a tracking query off the pasted link instead of framing it', () => {
    render(<RichTextBody data={doc([videoBlock('https://vimeo.com/76979871?utm_source=newsletter&autoplay=1')])} />)
    const src = document.querySelector('iframe')?.getAttribute('src') ?? ''
    expect(src.startsWith('https://player.vimeo.com/video/76979871')).toBe(true)
    expect(src).not.toContain('utm_source')
  })

  it('keeps the article intact around a video whose provider is no longer supported', () => {
    render(<RichTextBody data={doc([para('قبل'), videoBlock('https://x.com/jack/status/20'), para('بعد')])} />)
    expect(screen.getByText('قبل')).toBeTruthy()
    expect(screen.getByText('بعد')).toBeTruthy()
    expect(screen.getByTestId('lf-link-card')).toBeTruthy()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('renders nothing at all for a half-written block with no url', () => {
    const { container } = render(<RichTextBody data={doc([videoBlock('')])} />)
    expect(container.textContent).toBe('')
  })
})

describe('legacy bodies keep reaching the default converters', () => {
  /**
   * 652 live articles contain an inline `upload` node. This asserts the default upload
   * converter is still reachable through our converter map — the single most expensive
   * thing this file could break.
   */
  it('renders an inline upload node', () => {
    const upload = {
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: mediaDoc(1),
      fields: { alt: 'صورة داخل المقال' },
    }
    render(<RichTextBody data={doc([para('قبل الصورة'), upload, para('بعد الصورة')])} />)
    expect(screen.getByAltText('صورة داخل المقال')).toBeTruthy()
    expect(screen.getByText('قبل الصورة')).toBeTruthy()
  })

  it('renders headings, quotes, lists and links', () => {
    const d = doc([
      { type: 'heading', tag: 'h2', children: [text('عنوان فرعي')], direction: 'rtl', format: '', indent: 0, version: 1 },
      { type: 'quote', children: [text('اقتباس')], direction: 'rtl', format: '', indent: 0, version: 1 },
      {
        type: 'list',
        listType: 'number',
        tag: 'ol',
        start: 1,
        direction: 'rtl',
        format: '',
        indent: 0,
        version: 1,
        children: [
          { type: 'listitem', value: 1, children: [text('أولا')], direction: 'rtl', format: '', indent: 0, version: 1 },
        ],
      },
      {
        type: 'paragraph',
        direction: 'rtl',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'link',
            version: 3,
            direction: 'rtl',
            format: '',
            indent: 0,
            fields: { linkType: 'custom', newTab: true, url: 'https://example.com/article' },
            children: [text('اقرأ المزيد')],
          },
        ],
      },
    ])
    render(<RichTextBody data={d} />)
    expect(screen.getByText('عنوان فرعي').tagName).toBe('H2')
    expect(screen.getByText('اقتباس')).toBeTruthy()
    expect(screen.getByText('أولا')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'اقرأ المزيد' }).getAttribute('href')).toBe(
      'https://example.com/article',
    )
  })

  it('preserves inline bold and italic formatting', () => {
    const d = doc([
      {
        type: 'paragraph',
        direction: 'rtl',
        format: '',
        indent: 0,
        version: 1,
        children: [
          { ...text('عريض'), format: 1 },
          { ...text('مائل'), format: 2 },
        ],
      },
    ])
    render(<RichTextBody data={d} />)
    expect(screen.getByText('عريض').tagName).toBe('STRONG')
    expect(screen.getByText('مائل').tagName).toBe('EM')
  })
})

describe('forward compatibility', () => {
  it('never leaks the converter library "unknown node" placeholder into an article', () => {
    // Payload's default behaviour for an unregistered node is to render the literal text
    // "unknown node" into the page. On a live magazine that is a visible defect, and it is
    // reachable just by deploying a new block before the frontend that renders it.
    const future = { type: 'block', version: 2, fields: { blockType: 'podcastEmbed', blockName: '' } }
    const { container } = render(<RichTextBody data={doc([para('نص المقال'), future])} />)
    expect(screen.getByText('نص المقال')).toBeTruthy()
    expect(container.textContent).not.toContain('unknown node')
  })

  it('ignores an unknown inline node type without dropping the paragraph around it', () => {
    const d = doc([
      {
        type: 'paragraph',
        direction: 'rtl',
        format: '',
        indent: 0,
        version: 1,
        children: [text('قبل '), { type: 'futureInline', version: 1 }, text(' بعد')],
      },
    ])
    expect(() => render(<RichTextBody data={d} />)).not.toThrow()
    expect(screen.getByText(/قبل/)).toBeTruthy()
  })

  it('renders an empty document without throwing', () => {
    expect(() => render(<RichTextBody data={doc([])} />)).not.toThrow()
    expect(() => render(<RichTextBody data={undefined} />)).not.toThrow()
  })
})
