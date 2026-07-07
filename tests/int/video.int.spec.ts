import { describe, it, expect } from 'vitest'

import { embedUrl } from '@/lib/video'

describe('embedUrl', () => {
  it('maps youtu.be short links', () => {
    expect(embedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('maps youtube watch links', () => {
    expect(embedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('passes through youtube embed links', () => {
    expect(embedUrl('https://www.youtube.com/embed/abc123')).toBe('https://www.youtube.com/embed/abc123')
  })
  it('maps vimeo links', () => {
    expect(embedUrl('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345')
  })
  it('returns null for unknown hosts and invalid urls', () => {
    expect(embedUrl('https://example.com/x')).toBeNull()
    expect(embedUrl('not a url')).toBeNull()
  })
})
