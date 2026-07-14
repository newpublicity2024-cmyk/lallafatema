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

import { IssueCard } from '@/components/IssueCard'
import { MagazineSection } from '@/components/MagazineSection'
import type { MagazineIssue } from '@/payload-types'

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

// Minimal issue mocks; cover is omitted (undefined) — PostImage renders its placeholder.
const issue = (id: number, issueNumber: number) => ({ id, issueNumber }) as unknown as MagazineIssue

describe('MagazineSection', () => {
  it('renders the heading, an archive link, one link per issue, and the dark band', () => {
    const issues = [issue(1, 167), issue(2, 166), issue(3, 165)]
    const { container } = render(<MagazineSection issues={issues} />)

    expect(screen.getByText('مجلة لالة فاطمة')).toBeTruthy()
    expect(container.querySelector('a[href="/magazine"]')).toBeTruthy()

    for (const iss of issues) {
      expect(container.querySelector(`a[href="/magazine/${iss.issueNumber}"]`)).toBeTruthy()
    }

    const section = container.querySelector('section')
    expect(section?.className).toContain('lf-band-dark')
  })

  it('renders nothing for an empty issue list', () => {
    const { container } = render(<MagazineSection issues={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('IssueCard variant', () => {
  it('shelf renders a white title and no lf-card box', () => {
    const { container } = render(<IssueCard issue={issue(1, 167)} variant="shelf" />)
    const heading = container.querySelector('h3')
    expect(heading?.className).toContain('text-white')
    expect(container.querySelector('.lf-card')).toBeNull()
  })

  it('card (default) still renders an lf-card element', () => {
    const { container } = render(<IssueCard issue={issue(1, 167)} />)
    expect(container.querySelector('.lf-card')).toBeTruthy()
  })
})
