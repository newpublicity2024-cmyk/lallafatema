import { describe, it, expect } from 'vitest'

import { validateUpload, ALLOWED_UPLOAD_MIME_TYPES } from '@/lib/upload-guard'

describe('validateUpload', () => {
  it('accepts a normal JPEG', () => {
    expect(validateUpload({ mimeType: 'image/jpeg', size: 2 * 1024 * 1024 })).toBe(true)
  })

  it('rejects SVG (stored-XSS vector)', () => {
    expect(validateUpload({ mimeType: 'image/svg+xml', size: 1000 })).toContain('غير مسموح')
  })

  it('rejects an unknown type', () => {
    expect(validateUpload({ mimeType: 'text/html', size: 10 })).toContain('غير مسموح')
  })

  it('rejects an image over 10MB', () => {
    expect(validateUpload({ mimeType: 'image/png', size: 11 * 1024 * 1024 })).toContain('الحد الأقصى')
  })

  it('accepts a PDF up to 25MB and rejects over', () => {
    expect(validateUpload({ mimeType: 'application/pdf', size: 24 * 1024 * 1024 })).toBe(true)
    expect(validateUpload({ mimeType: 'application/pdf', size: 26 * 1024 * 1024 })).toContain('الحد الأقصى')
  })

  it('exposes an allowlist without SVG but with PDF', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('image/svg+xml')
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('application/pdf')
  })
})
