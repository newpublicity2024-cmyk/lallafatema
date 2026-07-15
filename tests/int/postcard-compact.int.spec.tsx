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
import { postUrl } from '@/lib/routes'

// Minimal Post; image=null exercises PostImage's placeholder (no next/image needed).
const basePost = {
  id: 1,
  title: 'عنوان تجريبي',
  slug: 'test',
  category: null,
  featuredImage: null,
  featuredType: 'image',
  publishedAt: '2026-01-01T00:00:00.000Z',
  _status: 'published',
} as unknown as import('@/payload-types').Post

const videoPost = {
  ...basePost,
  id: 2,
  featuredType: 'video',
} as unknown as import('@/payload-types').Post

afterEach(() => cleanup())

describe('PostCard compact variant', () => {
  it('the thumbnail link and the title link both point at the post URL', () => {
    const { container } = render(<PostCard post={basePost} variant="compact" />)
    const links = container.querySelectorAll('a')
    const expectedHref = postUrl(basePost)
    expect(links.length).toBeGreaterThanOrEqual(2)
    links.forEach((link) => {
      expect(link.getAttribute('href')).toBe(expectedHref)
    })
  })

  it('clamps the title to 2 lines, not 3', () => {
    const { container } = render(<PostCard post={basePost} variant="compact" />)
    const heading = container.querySelector('h3')!
    expect(heading.className).toContain('line-clamp-2')
    expect(heading.className).not.toContain('line-clamp-3')
  })

  it('gives the thumbnail a responsive width (w-32 at base, lg:w-40) and drops w-28', () => {
    const { container } = render(<PostCard post={basePost} variant="compact" />)
    const thumbLink = container.querySelector('a.relative')!
    expect(thumbLink.className).toContain('w-32')
    expect(thumbLink.className).toContain('lg:w-40')
    expect(thumbLink.className).not.toContain('w-28')
  })

  it('renders the small play badge for a video post but not for a normal post', () => {
    const { container: videoContainer } = render(<PostCard post={videoPost} variant="compact" />)
    // The play badge is the only <svg> the compact card can render (the no-image
    // placeholder is text-only), so this is an unambiguous marker for it.
    expect(videoContainer.querySelector('svg')).not.toBeNull()

    const { container: normalContainer } = render(<PostCard post={basePost} variant="compact" />)
    expect(normalContainer.querySelector('svg')).toBeNull()
  })

  it('still renders the RelativeTime element', () => {
    const { container } = render(<PostCard post={basePost} variant="compact" />)
    expect(container.querySelector('time')).not.toBeNull()
  })
})
