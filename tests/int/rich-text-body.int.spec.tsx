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

/**
 * The self-hosted `videoFile` block.
 *
 * What makes this worth testing separately from `videoEmbed` is that nothing here is an
 * iframe: the article ships a real `<video>` served from our own object storage, and the two
 * things that can go wrong are invisible in a screenshot. One is `preload` — get it wrong
 * and every reader who opens the article pays for a 72 MB download they never asked for. The
 * other is the `src` itself, which is the only attribute on this page built from a database
 * string rather than from a hard-coded origin.
 */
const videoFileNode = (fields: Record<string, unknown>) => ({
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'قبل الفيديو' }] },
      { type: 'block', fields: { blockType: 'videoFile', ...fields } },
    ],
  },
})

const STORED_VIDEO = {
  url: 'https://store.public.blob.vercel-storage.com/clip-abc123.mp4',
  mimeType: 'video/mp4',
  filename: 'clip-abc123.mp4',
}

const STORED_POSTER = {
  url: 'https://store.public.blob.vercel-storage.com/poster-abc123.jpg',
  mimeType: 'image/jpeg',
  filename: 'poster-abc123.jpg',
  width: 848,
  height: 480,
}

describe('RichTextBody — videoFile block', () => {
  it('renders a real video element carrying the stored file and its type', () => {
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: STORED_VIDEO, caption: 'المقطع كاملًا' })} />,
    )

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    // Native controls, not a bespoke player: this is what makes it keyboard-operable.
    expect(video?.hasAttribute('controls')).toBe(true)

    const source = container.querySelector('video source')
    expect(source?.getAttribute('src')).toBe(STORED_VIDEO.url)
    expect(source?.getAttribute('type')).toBe('video/mp4')

    // The paragraph beside it still renders — the block is additive, not a takeover.
    expect(within(container).getByText('قبل الفيديو')).toBeDefined()
    expect(within(container).getByText('المقطع كاملًا')).toBeDefined()
  })

  it('ships zero video bytes when the block carries a poster', () => {
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: STORED_VIDEO, poster: STORED_POSTER })} />,
    )
    const video = container.querySelector('video')
    expect(video?.getAttribute('poster')).toBe(STORED_POSTER.url)
    expect(video?.getAttribute('preload')).toBe('none')
  })

  /**
   * Without a poster there is no frame to draw, so metadata-only is the lesser evil. Pinned
   * because the tempting "simplification" is to hard-code `preload="none"` everywhere, which
   * leaves a black rectangle where the video should be in every browser that honours it.
   */
  it('falls back to metadata-only preload when no poster was supplied', () => {
    const { container } = render(<RichTextBody data={videoFileNode({ video: STORED_VIDEO })} />)
    expect(container.querySelector('video')?.getAttribute('preload')).toBe('metadata')
    expect(container.querySelector('video')?.hasAttribute('poster')).toBe(false)
  })

  /**
   * The poster is an IMAGE, so Payload records its dimensions, and a poster is a frame of
   * the video — so its shape IS the video's shape. Reserving the box from it is what keeps a
   * portrait clip from being letterboxed into a 16:9 strip, and what keeps the page from
   * reflowing when the video's own metadata finally arrives.
   */
  it('reserves the box from the poster\'s real dimensions', () => {
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: STORED_VIDEO, poster: STORED_POSTER })} />,
    )
    const box = container.querySelector('video')?.parentElement
    expect(box?.style.aspectRatio).toBe('848 / 480')
    // The fixed-ratio utility must be gone, or it would fight the inline style.
    expect(box?.className).not.toContain('aspect-video')
  })

  it('reserves a TALL box for a portrait clip rather than letterboxing it', () => {
    const portrait = { ...STORED_POSTER, width: 1080, height: 1920 }
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: STORED_VIDEO, poster: portrait })} />,
    )
    const box = container.querySelector('video')?.parentElement
    expect(box?.style.aspectRatio).toBe('1080 / 1920')
    // ...but bounded, so a 9:16 clip cannot reserve more than a screen of height.
    expect(box?.style.maxHeight).toBe('80vh')
  })

  /**
   * Half a measurement is not a measurement. A wrong reserved box cannot be corrected
   * without the very reflow this is preventing, so anything unmeasurable falls back to 16:9.
   */
  it.each([
    ['no dimensions at all', {}],
    ['width only', { width: 1080 }],
    ['a zero dimension', { width: 1080, height: 0 }],
    ['a negative dimension', { width: -1080, height: 1920 }],
    ['a non-numeric dimension', { width: '1080', height: 1920 }],
  ])('falls back to a 16:9 box when the poster has %s', (_label, dims) => {
    const { container } = render(
      <RichTextBody
        data={videoFileNode({ video: STORED_VIDEO, poster: { ...STORED_POSTER, width: undefined, height: undefined, ...dims } })}
      />,
    )
    const box = container.querySelector('video')?.parentElement
    expect(box?.className).toContain('aspect-video')
    expect(box?.style.aspectRatio).toBe('')
  })

  it('falls back to a 16:9 box when there is no poster at all', () => {
    const { container } = render(<RichTextBody data={videoFileNode({ video: STORED_VIDEO })} />)
    const box = container.querySelector('video')?.parentElement
    expect(box?.className).toContain('aspect-video')
  })

  it('renders nothing when the media relationship was not populated', () => {
    // depth: 0 — the field is a bare id, so there is no URL to play. An empty 16:9 box with
    // a caption under it reads to a reader as a broken page.
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: 4242, caption: 'لن يظهر' })} />,
    )
    expect(container.querySelector('video')).toBeNull()
    expect(container.textContent).toBe('قبل الفيديو')
  })

  /**
   * NEGATIVE CONTROL for `safeMediaSrc`. The two assertions above would both pass against a
   * renderer that interpolated `media.url` straight into the attribute, so this is the one
   * that proves the guard exists: a media row whose url is not an https URL or a
   * site-relative path must never reach a `src`.
   */
  it('refuses a media url that is not https or site-relative', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', '//evil.test/x.mp4']) {
      const { container } = render(
        <RichTextBody data={videoFileNode({ video: { ...STORED_VIDEO, url } })} />,
      )
      expect(container.querySelector('video')).toBeNull()
      expect(container.querySelector('source')).toBeNull()
    }

    // ...and the same renderer DOES emit a site-relative url, so the check above is a
    // rejection of these three inputs rather than of every input.
    const { container } = render(
      <RichTextBody data={videoFileNode({ video: { ...STORED_VIDEO, url: '/media/clip.mp4' } })} />,
    )
    expect(container.querySelector('video source')?.getAttribute('src')).toBe('/media/clip.mp4')
  })

  /**
   * The rollout guard documented in `RichTextBody`: during a deploy an editor can save a
   * block type the live frontend does not know yet. It must render as nothing, never as
   * Payload's literal "unknown node" text in the middle of an article.
   */
  it('renders nothing for a block type this build does not know', () => {
    // Positive control first: the same harness DOES produce an element for a block type
    // this build knows, so "renders nothing" below is a statement about the block type and
    // not about the fixture.
    const { container } = render(<RichTextBody data={videoFileNode({ video: STORED_VIDEO })} />)
    expect(container.querySelector('video')).not.toBeNull()

    const future = render(
      <RichTextBody
        data={{
          root: {
            type: 'root',
            children: [{ type: 'block', fields: { blockType: 'podcastFromTheFuture', url: 'x' } }],
          },
        }}
      />,
    )
    expect(future.container.textContent).toBe('')
    expect(future.container.textContent).not.toContain('unknown')
  })
})
