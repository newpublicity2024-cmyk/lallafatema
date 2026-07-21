import { describe, it, expect } from 'vitest'
import { render, within } from '@testing-library/react'

import { RichTextBody } from '@/components/RichTextBody'

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
