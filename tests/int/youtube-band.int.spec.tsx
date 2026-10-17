import React from 'react'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// next/link needs no router when rendered as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

import { VideoSection } from '@/components/VideoSection'
import { YoutubeVideoGrid } from '@/components/YoutubeVideoGrid'
import type { YoutubeVideo } from '@/payload-types'

/**
 * The homepage video band and the /videos grid, now rendering CHANNEL videos.
 *
 * The behaviour worth pinning here is not the layout, which barely changed — it is the
 * two properties that make the swap safe:
 *
 *   1. **Nothing navigates away.** A channel video has no article to open, and the band
 *      occupies the magazine's most valuable above-the-fold slot. If a card ever became a
 *      link to youtube.com, the band would be handing that slot to YouTube. So: no
 *      anchors pointing off-site, anywhere in the band.
 *   2. **No iframe exists until the reader asks for one.** Five YouTube iframes above the
 *      fold is megabytes of third-party JavaScript and a set of profiling cookies on load;
 *      that is what the click-to-load facade exists to prevent, and it is exactly the kind
 *      of thing that silently regresses.
 */

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

const video = (n: number, title: string): YoutubeVideo =>
  ({
    id: n,
    videoId: `vid${String(n).padStart(8, '0')}`,
    title,
    description: `وصف ${n}`,
    publishedAt: new Date(Date.UTC(2026, 9, 15 - n)).toISOString(),
    thumbnailUrl: `https://img.youtube.com/vi/vid${String(n).padStart(8, '0')}/hqdefault.jpg`,
    isShort: false,
    hidden: false,
    channelId: 'UCgJShJYlHW79y-ETvEqTI9w',
    updatedAt: '2026-10-15T00:00:00.000Z',
    createdAt: '2026-10-15T00:00:00.000Z',
  }) as YoutubeVideo

/**
 * The two layouts are both always in the DOM; only CSS hides one. Tests must therefore say
 * WHICH layout they mean, or an assertion about "the player" silently measures the other.
 */
const desktop = (c: HTMLElement) => c.querySelector('.hidden.md\\:block') as HTMLElement
const mobile = (c: HTMLElement) => c.querySelector('.md\\:hidden') as HTMLElement

const VIDEOS = [
  video(1, 'الفيديو الأول'),
  video(2, 'الفيديو الثاني'),
  video(3, 'الفيديو الثالث'),
  video(4, 'الفيديو الرابع'),
  video(5, 'الفيديو الخامس'),
]

describe('VideoSection — the homepage band', () => {
  it('renders the heading and a link to the aggregated listing', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)
    expect(screen.getByText('فيديو')).toBeTruthy()
    expect(container.querySelector('a[href="/videos"]')).toBeTruthy()
  })

  it('renders nothing at all when there are no videos', () => {
    const { container } = render(<VideoSection videos={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows every video title', () => {
    render(<VideoSection videos={VIDEOS} />)
    for (const v of VIDEOS) {
      // Desktop lead/list and the mobile carousel both render, so a title appears twice.
      expect(screen.getAllByText(v.title).length).toBeGreaterThan(0)
    }
  })

  it('loads no iframe until the reader clicks', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('plays in place on click, from the privacy-preserving nocookie origin', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)

    fireEvent.click(within(desktop(container)).getByLabelText(`تشغيل: ${VIDEOS[0].title}`))

    const frames = container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const src = frames[0].getAttribute('src') ?? ''
    expect(src.startsWith('https://www.youtube-nocookie.com/embed/vid00000001')).toBe(true)
    // Autoplay is only ever added after an explicit click.
    expect(src).toContain('autoplay=1')
  })

  it('promotes a list item into the lead frame when it is chosen', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)

    // The third video is a list row on desktop, not the lead.
    fireEvent.click(within(desktop(container)).getByLabelText(`تشغيل: ${VIDEOS[2].title}`))

    const frames = desktop(container).querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0].getAttribute('src')).toContain('vid00000003')
    // Selecting swaps the lead; it does not add a second player.
    expect(container.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('creates no player in the layout the reader cannot see', () => {
    // REGRESSION. Both layouts are always in the DOM and only CSS hides one, so sharing
    // playback state between them made a single click mount two iframes — one visible,
    // one inside `md:hidden`. A display:none iframe still loads its src, so that was two
    // YouTube players, two cookie jars and two autoplay attempts for one click.
    const { container } = render(<VideoSection videos={VIDEOS} />)

    fireEvent.click(within(desktop(container)).getByLabelText(`تشغيل: ${VIDEOS[0].title}`))
    expect(desktop(container).querySelectorAll('iframe')).toHaveLength(1)
    expect(mobile(container).querySelectorAll('iframe')).toHaveLength(0)

    cleanup()

    const second = render(<VideoSection videos={VIDEOS} />)
    fireEvent.click(within(mobile(second.container)).getByLabelText(`تشغيل: ${VIDEOS[0].title}`))
    expect(mobile(second.container).querySelectorAll('iframe')).toHaveLength(1)
    expect(desktop(second.container).querySelectorAll('iframe')).toHaveLength(0)
  })

  it('never links the reader off the site', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/videos'])
    for (const href of hrefs) {
      expect(href).not.toMatch(/youtube\.com|youtu\.be/)
    }
  })

  it('uses plain <img> posters, not the Cloudflare image loader', () => {
    // next/image would route a YouTube URL through this project's custom loader, whose
    // zone fronts our own object storage only — it would 404 in production.
    const { container } = render(<VideoSection videos={VIDEOS} />)
    const images = Array.from(container.querySelectorAll('img'))
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) {
      const src = img.getAttribute('src') ?? ''
      expect(src.startsWith('https://img.youtube.com/vi/')).toBe(true)
      expect(src).not.toContain('/cdn-cgi/image/')
      expect(src).not.toContain('/_next/image')
    }
  })

  it('gives the lead poster eager loading and the rest lazy', () => {
    const { container } = render(<VideoSection videos={VIDEOS} />)
    const images = Array.from(container.querySelectorAll('img'))
    expect(images.some((i) => i.getAttribute('loading') === 'eager')).toBe(true)
    expect(images.some((i) => i.getAttribute('loading') === 'lazy')).toBe(true)
  })
})

describe('YoutubeVideoGrid — the /videos listing', () => {
  it('renders a cell per video with no iframe until clicked', () => {
    const { container } = render(<YoutubeVideoGrid videos={VIDEOS} />)
    expect(screen.getByText(VIDEOS[0].title)).toBeTruthy()
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('plays only one video at a time', () => {
    const { container } = render(<YoutubeVideoGrid videos={VIDEOS} />)

    fireEvent.click(screen.getByLabelText(`تشغيل: ${VIDEOS[0].title}`))
    expect(container.querySelectorAll('iframe')).toHaveLength(1)

    fireEvent.click(screen.getByLabelText(`تشغيل: ${VIDEOS[1].title}`))
    const frames = container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0].getAttribute('src')).toContain('vid00000002')
  })
})
