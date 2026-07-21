import { describe, it, expect } from 'vitest'

import { validateUpload, ALLOWED_UPLOAD_MIME_TYPES } from '@/lib/upload-guard'
import { enforceUploadGuard } from '@/collections/Media'

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

  it('accepts a PDF up to 40MB and rejects over', () => {
    expect(validateUpload({ mimeType: 'application/pdf', size: 28 * 1024 * 1024 })).toBe(true)
    const rejected = validateUpload({ mimeType: 'application/pdf', size: 41 * 1024 * 1024 })
    expect(rejected).toContain('40')
    expect(rejected).toContain('ميغابايت')
  })

  it('accepts a file exactly AT the cap (inclusive boundary)', () => {
    expect(validateUpload({ mimeType: 'image/png', size: 10 * 1024 * 1024 })).toBe(true)
    expect(validateUpload({ mimeType: 'application/pdf', size: 40 * 1024 * 1024 })).toBe(true)
  })

  it('exposes an allowlist without SVG but with PDF', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('image/svg+xml')
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('application/pdf')
  })
})

/**
 * The client-upload path (clientUploads: true): the file goes browser → Blob
 * directly, and the doc-create carries only DECLARED metadata — req.file never
 * exists. Found live: a 15.3MB image sailed past the 10MB cap because the hook
 * early-returned on the missing file. These pin the declared-metadata branch.
 */
describe('enforceUploadGuard — client-upload creates (no req.file)', () => {
  const run = (args: {
    data?: Record<string, unknown>
    file?: { mimetype: string; size?: number; data?: Buffer }
    operation?: string
  }) =>
    enforceUploadGuard({
      data: args.data,
      operation: args.operation ?? 'create',
      req: { file: args.file },
    } as never)

  it('rejects an oversized declared image on create', () => {
    expect(() =>
      run({ data: { mimeType: 'image/jpeg', filesize: 16 * 1024 * 1024 } }),
    ).toThrow(/الحد الأقصى/)
  })

  it('rejects a declared SVG on create', () => {
    expect(() => run({ data: { mimeType: 'image/svg+xml', filesize: 1000 } })).toThrow(
      /غير مسموح/,
    )
  })

  it('accepts a valid declared JPEG on create', () => {
    expect(() =>
      run({ data: { mimeType: 'image/jpeg', filesize: 3 * 1024 * 1024 } }),
    ).not.toThrow()
  })

  it('still validates real files when req.file is present', () => {
    expect(() =>
      run({ file: { mimetype: 'image/svg+xml', size: 500 }, data: {} }),
    ).toThrow(/غير مسموح/)
  })

  it('falls back to the buffer length when req.file.size is missing', () => {
    // The client-upload fetch-back rebuilds req.file with `size` taken from the
    // admin's file JSON — which omits it, so `size` is undefined while `data`
    // holds the real bytes. Treating that as size 0 waved a 15.3MB image past
    // the 10MB cap in production-shaped flows. The buffer is authoritative.
    expect(() =>
      run({
        file: { mimetype: 'image/jpeg', data: Buffer.alloc(11 * 1024 * 1024) },
        data: {},
      }),
    ).toThrow(/الحد الأقصى/)
  })

  it('falls back to declared filesize when the file has neither size nor data', () => {
    expect(() =>
      run({
        file: { mimetype: 'image/jpeg' },
        data: { filesize: 12 * 1024 * 1024 },
      }),
    ).toThrow(/الحد الأقصى/)
  })

  it('leaves metadata-only edits alone (no file, no declared file data)', () => {
    // Editing alt text on an existing image: update with neither req.file nor
    // declared mimeType/filesize must not throw.
    expect(() => run({ data: { alt: 'وصف جديد' }, operation: 'update' })).not.toThrow()
  })

  it('does not re-validate declared metadata on update', () => {
    // The admin can resubmit a full doc (unchanged mimeType/filesize) when
    // saving an alt edit. Legacy media that predates the caps must stay
    // editable, so declared values are only enforced at create.
    expect(() =>
      run({ data: { mimeType: 'image/jpeg', filesize: 16 * 1024 * 1024 }, operation: 'update' }),
    ).not.toThrow()
  })
})
