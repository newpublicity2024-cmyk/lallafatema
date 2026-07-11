import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'

import { PostImage } from '@/components/PostImage'

// Guards the placeholder path only (image null/not-an-object) — no <Image> is ever
// invoked here, so this needs no next/image mock. The real-image branch is exercised
// visually via the existing routes/pages, not unit-tested here.
describe('PostImage placeholder (no image)', () => {
  afterEach(() => cleanup())

  it('names the placeholder from `alt` so an image-only link has an accessible name', () => {
    render(<PostImage image={null} alt="عنوان تجريبي" />)
    expect(screen.getByRole('img', { name: 'عنوان تجريبي' })).toBeTruthy()
  })

  it('falls back to the site wordmark when no alt is given', () => {
    render(<PostImage image={null} />)
    expect(screen.getByRole('img', { name: 'لالة فاطمة' })).toBeTruthy()
  })

  it('keeps the decorative wordmark aria-hidden (not part of the accessible name)', () => {
    render(<PostImage image={null} alt="عنوان تجريبي" />)
    // getByRole already proves the accessible name is exactly "عنوان تجريبي" (not
    // polluted by the wordmark); this additionally confirms the wordmark node itself
    // is aria-hidden, so it can't be separately announced when AT walks the subtree.
    const wordmark = screen.getByText('لالة فاطمة')
    expect(wordmark.getAttribute('aria-hidden')).toBe('true')
  })
})
