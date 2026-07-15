import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

// next/link needs no router when we render it as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

import { LeadListBlock } from '@/components/LeadListBlock'
import { postUrl } from '@/lib/routes'
import type { Category, MagazineIssue, Post } from '@/payload-types'

beforeAll(() => {
  // jsdom has no IntersectionObserver; Carousel's effect needs one to construct.
  class IO {
    constructor(_cb: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

afterEach(() => cleanup())

const category = { id: 10, name: 'مشاهير', slug: 'celebrities' } as unknown as Category

// Minimal mocks; featuredImage/cover omitted — PostImage renders its placeholder.
const post = (id: number) =>
  ({
    id,
    title: `عنوان ${id}`,
    slug: `post-${id}`,
    category: null,
    featuredImage: null,
    featuredType: 'image',
    publishedAt: '2026-01-01T00:00:00.000Z',
    _status: 'published',
  }) as unknown as Post

const posts = [post(1), post(2), post(3), post(4), post(5)]

const issue = { id: 1, issueNumber: 167 } as unknown as MagazineIssue

/** The `hidden md:block` wrapper's only child is the desktop grid. */
const desktopGrid = (container: HTMLElement): HTMLElement => {
  const wrapper = Array.from(container.querySelectorAll('div')).find(
    (d) => d.className.includes('hidden') && d.className.includes('md:block'),
  )
  expect(wrapper).toBeTruthy()
  return wrapper!.firstElementChild as HTMLElement
}

describe('LeadListBlock with a magazineIssue', () => {
  it('renders the rail and switches the desktop grid to 12 columns at lg', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    // The rail's heading is unique to MagazineRail. It appears twice: once in the
    // md:hidden mobile stack and once in the hidden md:block desktop grid — the same
    // breakpoint-duplicated DOM the posts themselves already use.
    expect(screen.getAllByText('إصدارات المجلة')).toHaveLength(2)

    const grid = desktopGrid(container)
    expect(grid.className).toContain('lg:grid-cols-12')
    expect(grid.className).not.toContain('lg:grid-cols-2')
    expect(grid.className).toContain('grid-cols-1')
  })

  it('puts the rail LAST in DOM order so RTL renders it on the visual left', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    const grid = desktopGrid(container)
    expect(grid.children.length).toBe(3)

    // First child = lead card, last child = the rail column.
    expect(grid.children[0].querySelector('article')).not.toBeNull()
    expect(grid.children[0].querySelector('aside')).toBeNull()

    const last = grid.lastElementChild!
    expect(last.querySelector('aside')).not.toBeNull()
    expect(last.textContent).toContain('إصدارات المجلة')
  })

  it('gives the three desktop columns spans that add up to 12', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    const grid = desktopGrid(container)
    expect(grid.children[0].className).toContain('lg:col-span-5')
    expect(grid.children[1].className).toContain('lg:col-span-4')
    expect(grid.children[2].className).toContain('lg:col-span-3')
  })

  // The lead's wrapper is the grid item, so the .lf-card inside it only stretches to
  // the list's height if the wrapper is itself a grid container. A plain block wrapper
  // leaves the card short and exposes the .lf-band gray beneath it.
  it('makes the lead column a grid container so its card stretches to the row height', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    const leadColumn = desktopGrid(container).children[0]
    expect(leadColumn.className).toContain('grid')
    expect(leadColumn.querySelector('article')).not.toBeNull()
  })

  it('also renders the rail below the mobile carousel', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    const mobile = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('md:hidden'),
    )!
    // Position, not just presence: the rail must be the LAST child, below the carousel.
    const last = mobile.lastElementChild!
    expect(last.querySelector('aside')).not.toBeNull()
    expect(last.textContent).toContain('إصدارات المجلة')
  })
})

// posts.length === 1 is reachable: page.tsx renders the block whenever the category has
// at least one post. With no list column, 5 + 3 would leave four dead columns and float
// the rail mid-row instead of flush at the visual left.
describe('LeadListBlock with a magazineIssue but only one post', () => {
  it('widens the lead to fill the freed span so the columns still add up to 12', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={[post(1)]} magazineIssue={issue} />,
    )

    const grid = desktopGrid(container)
    expect(grid.children.length).toBe(2)
    expect(grid.children[0].className).toContain('lg:col-span-9')
    expect(grid.children[0].className).not.toContain('lg:col-span-5')
    expect(grid.children[1].className).toContain('lg:col-span-3')
  })

  it('keeps the rail last in DOM order', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={[post(1)]} magazineIssue={issue} />,
    )

    const last = desktopGrid(container).lastElementChild!
    expect(last.querySelector('aside')).not.toBeNull()
  })
})

describe('LeadListBlock without a magazineIssue', () => {
  it('renders no rail and keeps the original 2-column desktop grid', () => {
    const { container } = render(<LeadListBlock category={category} posts={posts} />)

    expect(screen.queryByText('إصدارات المجلة')).toBeNull()
    expect(container.querySelector('aside')).toBeNull()

    const grid = desktopGrid(container)
    expect(grid.className).toContain('lg:grid-cols-2')
    expect(grid.className).not.toContain('lg:grid-cols-12')
    expect(grid.children.length).toBe(2)

    // The lead column still stretches, but the 2-col fallback carries no span classes.
    expect(grid.children[0].className).toBe('grid')
  })

  it('treats an explicit null the same as an omitted prop', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={null} />,
    )

    expect(container.querySelector('aside')).toBeNull()
    expect(desktopGrid(container).className).toContain('lg:grid-cols-2')
  })
})

describe('LeadListBlock posts', () => {
  it('renders the lead plus up to 4 compact cards in the desktop grid', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={posts} magazineIssue={issue} />,
    )

    const grid = desktopGrid(container)
    // 1 lead + 4 list cards.
    expect(grid.querySelectorAll('article').length).toBe(5)

    for (const p of posts) {
      expect(grid.querySelector(`a[href="${postUrl(p)}"]`)).toBeTruthy()
    }
  })

  it('renders nothing for an empty post list', () => {
    const { container } = render(
      <LeadListBlock category={category} posts={[]} magazineIssue={issue} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
