import { describe, it, expect } from 'vitest'

import {
  magazineArchiveUrl,
  magazineIssueUrl,
  issueNumberFromParam,
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
  })
})
