import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'

// next/link needs no router when we render it as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

import { MagazineRail } from '@/components/MagazineRail'
import type { MagazineIssue } from '@/payload-types'

afterEach(() => cleanup())

// Minimal issue mocks; cover is omitted (undefined) — PostImage renders its placeholder.
const issue = (id: number, issueNumber: number, extra = {}) =>
  ({ id, issueNumber, ...extra }) as unknown as MagazineIssue

describe('MagazineRail', () => {
  it('renders the heading and the digital-edition + archive links pointing at the right URLs', () => {
    const iss = issue(1, 167, { title: 'عدد يونيو' })
    const { container } = render(<MagazineRail issue={iss} />)

    expect(screen.getByText('إصدارات المجلة')).toBeTruthy()
    expect(screen.getByText('النسخة الرقمية')).toBeTruthy()
    expect(screen.getByText('كل الأعداد ←')).toBeTruthy()

    const links = Array.from(container.querySelectorAll('a[href="/magazine/167"]'))
    expect(links.length).toBeGreaterThanOrEqual(2) // cover link + digital-edition link

    expect(container.querySelector('a[href="/magazine"]')).toBeTruthy()
  })

  it('the cover link points at the issue URL', () => {
    const iss = issue(2, 150)
    const { container } = render(<MagazineRail issue={iss} />)
    const coverLink = container.querySelector('a[href="/magazine/150"]')
    expect(coverLink).toBeTruthy()
  })

  it('falls back to العدد <n> when issue.title is absent', () => {
    const iss = issue(3, 152)
    render(<MagazineRail issue={iss} />)
    expect(screen.getByRole('img', { name: 'العدد 152' })).toBeTruthy()
  })

  it('uses issue.title when present', () => {
    const iss = issue(4, 153, { title: 'عدد خاص' })
    render(<MagazineRail issue={iss} />)
    expect(screen.getByRole('img', { name: 'عدد خاص' })).toBeTruthy()
  })

  it('omits the <time> element entirely when publishDate is absent', () => {
    const iss = issue(5, 154)
    const { container } = render(<MagazineRail issue={iss} />)
    expect(container.querySelector('time')).toBeNull()
  })

  it('renders a <time> element with an ISO dateTime when publishDate is present', () => {
    const iss = issue(6, 155, { publishDate: '2026-06-01T00:00:00.000Z' })
    const { container } = render(<MagazineRail issue={iss} />)
    const time = container.querySelector('time')
    expect(time).toBeTruthy()
    expect(time?.getAttribute('dateTime')).toBe(new Date('2026-06-01T00:00:00.000Z').toISOString())
  })

  it('gates the vertical split to lg: and uses a logical property, not a physical one', () => {
    const iss = issue(7, 156)
    const { container } = render(<MagazineRail issue={iss} />)
    const aside = container.querySelector('aside')
    expect(aside).toBeTruthy()
    expect(aside?.className).toContain('lg:border-s')
    expect(aside?.className).not.toMatch(/\b(border-l|border-r)\b/)
  })
})
