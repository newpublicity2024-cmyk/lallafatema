import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'

import { PageView } from '@/components/PageView'
import type { Page } from '@/payload-types'

function makePage(slug: string): Page {
  return {
    id: 1,
    title: `عنوان ${slug}`,
    slug,
    updatedAt: '2026-07-07T00:00:00.000Z',
    createdAt: '2026-07-07T00:00:00.000Z',
    content: {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        direction: 'rtl',
        children: [
          {
            type: 'paragraph',
            version: 1,
            format: '',
            indent: 0,
            direction: 'rtl',
            children: [{ type: 'text', version: 1, text: 'نص تجريبي', format: 0, detail: 0, mode: 'normal', style: '' }],
          },
        ],
      },
    },
  } as unknown as Page
}

describe('PageView', () => {
  afterEach(() => cleanup())

  it('renders the page title as a heading', () => {
    render(<PageView page={makePage('about')} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('عنوان about')
  })

  it('shows "آخر تحديث" on legal pages (privacy)', () => {
    render(<PageView page={makePage('privacy')} />)
    expect(screen.getByText(/آخر تحديث/)).toBeTruthy()
  })

  it('hides "آخر تحديث" on non-legal pages (about)', () => {
    render(<PageView page={makePage('about')} />)
    expect(screen.queryByText(/آخر تحديث/)).toBeNull()
  })
})
