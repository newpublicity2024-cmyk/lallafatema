import { describe, it, expect } from 'vitest'

import {
  magazineArchiveUrl,
  magazineIssueUrl,
  issueNumberFromParam,
  videosListingUrl,
  pageUrl,
  pageShowsUpdatedDate,
} from '@/lib/routes'

describe('magazine routes', () => {
  it('archive url is /magazine', () => {
    expect(magazineArchiveUrl()).toBe('/magazine')
  })

  it('issue url uses the issue number', () => {
    expect(magazineIssueUrl({ issueNumber: 167 })).toBe('/magazine/167')
  })

  it('parses a numeric issue-number param', () => {
    expect(issueNumberFromParam('167')).toBe(167)
    expect(issueNumberFromParam('1')).toBe(1)
  })

  it('rejects non-numeric / malformed params', () => {
    expect(issueNumberFromParam('abc')).toBeNull()
    expect(issueNumberFromParam('1a')).toBeNull()
    expect(issueNumberFromParam('')).toBeNull()
    expect(issueNumberFromParam('-5')).toBeNull()
    expect(issueNumberFromParam('1.5')).toBeNull()
    expect(issueNumberFromParam('0')).toBeNull()
    expect(issueNumberFromParam('007')).toBeNull()
  })
})

describe('videosListingUrl', () => {
  it('videosListingUrl is /videos', () => {
    expect(videosListingUrl()).toBe('/videos')
  })
})

describe('pageUrl', () => {
  it('builds a clean top-level url', () => {
    expect(pageUrl('about')).toBe('/about')
    expect(pageUrl('privacy')).toBe('/privacy')
  })
})

describe('pageShowsUpdatedDate', () => {
  it('is true for legal pages', () => {
    expect(pageShowsUpdatedDate('privacy')).toBe(true)
    expect(pageShowsUpdatedDate('terms')).toBe(true)
  })
  it('is false for other pages', () => {
    expect(pageShowsUpdatedDate('about')).toBe(false)
    expect(pageShowsUpdatedDate('advertise')).toBe(false)
    expect(pageShowsUpdatedDate('')).toBe(false)
  })
})
