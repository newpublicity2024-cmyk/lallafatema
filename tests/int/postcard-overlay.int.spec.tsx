import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'

// next/link needs no router when we render it as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

import { PostCard } from '@/components/PostCard'

// Minimal Post; image=null exercises PostImage's placeholder (no next/image needed).
const post = {
  id: 1,
  title: 'عنوان تجريبي',
  slug: 'test',
  category: null,
  featuredImage: null,
  featuredType: 'image',
  publishedAt: '2026-01-01T00:00:00.000Z',
  _status: 'published',
} as unknown as import('@/payload-types').Post

afterEach(() => cleanup())

describe('PostCard overlay variant', () => {
  it('is a 4:5 poster with a small overlaid title on mobile (upgrades at md+)', () => {
    const { container } = render(<PostCard post={post} variant="overlay" fill />)
    const article = container.querySelector('article')!
    expect(article.className).toContain('aspect-[4/5]')
    expect(article.className).toContain('md:aspect-video')
    const heading = container.querySelector('h2')!
    expect(heading.className).toContain('text-lg')
    expect(heading.className).toContain('md:text-3xl')
  })

  it('non-fill overlay is also a 4:5 poster', () => {
    const { container } = render(<PostCard post={post} variant="overlay" />)
    expect(container.querySelector('article')!.className).toContain('aspect-[4/5]')
  })
})
