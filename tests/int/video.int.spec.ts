import { describe, it, expect } from 'vitest'

import { embedUrl, youtubeId, youtubeThumbnailUrl } from '@/lib/video'

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

describe('youtubeId', () => {
  it('extracts id from watch links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('extracts id from youtu.be links', () => {
    expect(youtubeId('https://youtu.be/A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('extracts id from embed links', () => {
    expect(youtubeId('https://www.youtube.com/embed/A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('returns null for non-youtube / invalid', () => {
    expect(youtubeId('https://vimeo.com/12345')).toBeNull()
    expect(youtubeId('https://www.instagram.com/reel/x/')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
  })
})

describe('youtubeThumbnailUrl', () => {
  it('builds an hqdefault url for youtube', () => {
    expect(youtubeThumbnailUrl('https://www.youtube.com/watch?v=A7OH7CK7ngw')).toBe(
      'https://img.youtube.com/vi/A7OH7CK7ngw/hqdefault.jpg',
    )
  })
  it('returns null for non-youtube', () => {
    expect(youtubeThumbnailUrl('https://vimeo.com/12345')).toBeNull()
  })
})
