import { describe, it, expect } from 'vitest'

import { isEditorialUser, editorialOnly } from '@/fields/visibility'

describe('isEditorialUser', () => {
  it('is true for admin and editor', () => {
    expect(isEditorialUser({ role: 'admin' })).toBe(true)
    expect(isEditorialUser({ role: 'editor' })).toBe(true)
  })

  it('is false for a journalist', () => {
    expect(isEditorialUser({ role: 'journalist' })).toBe(false)
  })

  it('is false when there is no user', () => {
    expect(isEditorialUser(null)).toBe(false)
    expect(isEditorialUser(undefined)).toBe(false)
  })
})

describe('editorialOnly', () => {
  it('shows the field to an editor and hides it from a journalist', () => {
    expect(editorialOnly({}, {}, { user: { role: 'editor' } })).toBe(true)
    expect(editorialOnly({}, {}, { user: { role: 'journalist' } })).toBe(false)
  })

  it('hides the field when there is no user in context', () => {
    expect(editorialOnly({}, {}, {})).toBe(false)
  })
})
