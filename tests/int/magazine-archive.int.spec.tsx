import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'

// next/link needs no router when we render it as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))
// next/image → a plain <img>, so a trimmed `{ url, alt }` cover is observable.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

import { IssueCard } from '@/components/IssueCard'
import { MagazineArchive } from '@/components/MagazineArchive'
import {
  magazineBatchUrl,
  parseBeforeCursor,
  toIssueCardData,
  type IssueBatch,
  type IssueCardData,
} from '@/lib/magazine'
import type { MagazineIssue, Media } from '@/payload-types'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A card DTO; issues 148+ have a PDF, like the real archive. */
const dto = (n: number): IssueCardData => ({
  id: 1000 + n,
  issueNumber: n,
  title: `العدد ${n}`,
  publishDate: null,
  cover: { url: `/api/media/file/lalla-fatema-cover-${n}.jpg`, alt: `غلاف العدد ${n}` },
  pdf: n >= 148 ? 5000 + n : null,
})
/** Issues from..to, newest first (from > to). */
const range = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, i) => dto(from - i))

const shownNumbers = (container: HTMLElement) =>
  [...container.querySelectorAll('article[data-issue-number]')].map((a) =>
    Number(a.getAttribute('data-issue-number')),
  )

function stubFetch(handler: (url: string) => { status?: number; body?: unknown }) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      const { status = 200, body } = handler(url)
      return new Response(JSON.stringify(body ?? {}), { status })
    }),
  )
  return calls
}

describe('IssueCard: PDF vs cover-only', () => {
  it('an issue with a PDF links cover and title to its reader page', () => {
    const { container } = render(<IssueCard issue={dto(167)} />)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/magazine/167', '/magazine/167'])
  })

  it('a cover-only issue renders its cover and title but no link at all, in both variants', () => {
    for (const variant of ['card', 'shelf'] as const) {
      const { container } = render(<IssueCard issue={dto(42)} variant={variant} />)
      expect(container.querySelector('a')).toBeNull()
      expect(container.querySelector('img')?.getAttribute('src')).toBe(
        '/api/media/file/lalla-fatema-cover-42.jpg',
      )
      expect(container.textContent).toContain('العدد 42')
      // No hover cue promising an action that does not exist.
      expect(container.innerHTML).not.toContain('group-hover:')
      cleanup()
    }
  })

  it('a full depth-1 MagazineIssue still renders (homepage path)', () => {
    const issue = {
      id: 1,
      issueNumber: 167,
      cover: { id: 9, url: '/api/media/file/cover.jpg', alt: 'غلاف' } as Media,
      pdf: { id: 10, url: '/api/media/file/x.pdf' } as Media,
    } as MagazineIssue
    const { container } = render(<IssueCard issue={issue} />)
    expect(container.querySelector('a[href="/magazine/167"]')).toBeTruthy()
  })
})

describe('archive helpers', () => {
  it('parseBeforeCursor accepts positive integers only', () => {
    expect(parseBeforeCursor('148')).toBe(148)
    expect(parseBeforeCursor('1')).toBe(1)
    for (const bad of [null, '', '0', '-1', '01', '1.5', 'abc', '148abc', ' 148', '1e3', '99999999999999999999']) {
      expect(parseBeforeCursor(bad)).toBeNull()
    }
  })

  it('magazineBatchUrl builds the cursor URL the endpoint reads', () => {
    expect(magazineBatchUrl(148)).toBe('/magazine/issues?before=148')
  })

  it('toIssueCardData trims a depth-1 issue to what the card reads', () => {
    const issue = {
      id: 7,
      issueNumber: 160,
      title: 'العدد 160',
      publishDate: null,
      cover: { id: 9, url: '/api/media/file/cover-7.jpg', alt: 'غلاف', filesize: 1 } as Media,
      pdf: { id: 10, url: '/api/media/file/x.pdf' } as Media,
      updatedAt: 'x',
      createdAt: 'x',
    } as MagazineIssue
    expect(toIssueCardData(issue)).toEqual({
      id: 7,
      issueNumber: 160,
      title: 'العدد 160',
      publishDate: null,
      cover: { url: '/api/media/file/cover-7.jpg', alt: 'غلاف' },
      pdf: 10,
    })
    expect(toIssueCardData({ ...issue, pdf: null }).pdf).toBeNull()
    expect(toIssueCardData({ ...issue, pdf: undefined }).pdf).toBeNull()
    expect(toIssueCardData({ ...issue, pdf: 33 }).pdf).toBe(33)
    // depth 0: an unpopulated cover id cannot be drawn, so it becomes null (placeholder).
    expect(toIssueCardData({ ...issue, cover: 9 }).cover).toBeNull()
  })
})

describe('MagazineArchive: load more', () => {
  const BUTTON = 'عرض المزيد من الأعداد'
  const first: IssueBatch = { issues: range(167, 148), hasMore: true }

  it('renders the first batch and a load-more button', () => {
    const { container } = render(<MagazineArchive initial={first} />)
    expect(shownNumbers(container)).toEqual(range(167, 148).map((i) => i.issueNumber))
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy()
  })

  it('walks the archive batch by batch from the last shown issue, then removes the button', async () => {
    const calls = stubFetch((url) => {
      const before = Number(new URL(url, 'http://x').searchParams.get('before'))
      const to = Math.max(1, before - 20)
      return { body: { issues: range(before - 1, to), hasMore: to > 1 } }
    })
    const { container } = render(<MagazineArchive initial={first} />)

    // 147 older issues → 8 clicks of up to 20.
    for (let click = 0; click < 8; click++) {
      fireEvent.click(await screen.findByRole('button', { name: BUTTON }))
      await waitFor(() => expect(shownNumbers(container).length).toBe(Math.min(167, 20 * (click + 2))))
    }

    expect(calls).toEqual([147 + 1, 128, 108, 88, 68, 48, 28, 8].map((b) => magazineBatchUrl(b)))
    const numbers = shownNumbers(container)
    expect(numbers).toEqual(Array.from({ length: 167 }, (_, i) => 167 - i))
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull()
    expect(screen.getByText('وصلتِ إلى أقدم عدد في الأرشيف.')).toBeTruthy()
    // Older issues are cover-only: they add no links.
    expect(container.querySelectorAll('a').length).toBe(2 * 20)
  })

  it('never shows an issue twice, even if a batch overlaps what is on screen', async () => {
    stubFetch(() => ({ body: { issues: [dto(149), dto(148), ...range(147, 140)], hasMore: true } }))
    const { container } = render(<MagazineArchive initial={first} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    await waitFor(() => expect(shownNumbers(container).length).toBe(28))
    const numbers = shownNumbers(container)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('a failed request keeps the list, says so, and a retry continues from the same place', async () => {
    let fail = true
    const calls = stubFetch(() => (fail ? { status: 500 } : { body: { issues: range(147, 128), hasMore: true } }))
    const { container } = render(<MagazineArchive initial={first} />)

    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(shownNumbers(container).length).toBe(20)

    fail = false
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }))
    await waitFor(() => expect(shownNumbers(container).length).toBe(40))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls).toEqual([magazineBatchUrl(148), magazineBatchUrl(148)])
  })

  it('an empty batch ends the archive even if it claims there is more', async () => {
    stubFetch(() => ({ body: { issues: [], hasMore: true } }))
    render(<MagazineArchive initial={first} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    await waitFor(() => expect(screen.queryByRole('button', { name: BUTTON })).toBeNull())
  })

  it('a double click starts one request, not two', async () => {
    const calls = stubFetch(() => ({ body: { issues: range(147, 128), hasMore: true } }))
    render(<MagazineArchive initial={first} />)
    const button = screen.getByRole('button', { name: BUTTON })
    fireEvent.click(button)
    fireEvent.click(button)
    await screen.findByRole('button', { name: BUTTON })
    await waitFor(() => expect(calls.length).toBe(1))
  })

  it('no button and no end line when everything fits in the first batch', () => {
    render(<MagazineArchive initial={{ issues: range(167, 160), hasMore: false }} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('وصلتِ إلى أقدم عدد في الأرشيف.')).toBeNull()
  })
})
