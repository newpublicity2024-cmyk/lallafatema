import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'

import { Carousel } from '@/components/Carousel'

beforeAll(() => {
  // jsdom has no IntersectionObserver; stub it so the effect can construct one.
  class IO {
    constructor(_cb: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

afterEach(() => cleanup())

describe('Carousel', () => {
  it('renders one dot per child, first active', () => {
    render(
      <Carousel>
        <div>one</div>
        <div>two</div>
        <div>three</div>
      </Carousel>,
    )
    const dots = screen.getAllByTestId('carousel-dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].getAttribute('data-active')).toBe('true')
    expect(dots[1].getAttribute('data-active')).toBe('false')
  })

  it('renders no dots for a single child', () => {
    render(
      <Carousel>
        <div>only</div>
      </Carousel>,
    )
    expect(screen.queryAllByTestId('carousel-dot')).toHaveLength(0)
  })

  it('wraps each child as a slide inside the track', () => {
    render(
      <Carousel>
        <div>one</div>
        <div>two</div>
      </Carousel>,
    )
    const track = screen.getByTestId('carousel-track')
    expect(track.children).toHaveLength(2)
  })
})
