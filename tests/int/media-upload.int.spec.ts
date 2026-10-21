import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { enforceUploadGuard } from '@/collections/Media'
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  validateUpload,
} from '@/lib/upload-guard'
import config from '@/payload.config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
let payload: Payload

// Direct, DB-free unit tests of the hook itself. The end-to-end SVG test below proves the hook
// is wired into the collection, but Payload's built-in scanner also rejects malicious SVGs
// upstream — so it does NOT exercise our unique enforcement path (the per-type SIZE cap). These
// call `enforceUploadGuard` directly. Arg is cast `as any` since we only populate `req.file`.
describe('Media upload guard (hook unit)', () => {
  it('throws on an oversized but otherwise-allowed image (size cap, not type)', () => {
    let message = ''
    expect(() =>
      enforceUploadGuard({
        req: { file: { mimetype: 'image/png', size: 11 * 1024 * 1024 } },      } as any),
    ).toThrow()

    try {
      enforceUploadGuard({
        req: { file: { mimetype: 'image/png', size: 11 * 1024 * 1024 } },      } as any)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    // Size-cap message, NOT the disallowed-type message. If the hook read the wrong property
    // (e.g. `.type`, always undefined), the image would be misread as a disallowed type and we'd
    // get `غير مسموح` instead — so this pins that `.mimetype` is read correctly.
    expect(message).toContain('الحد الأقصى')
    expect(message).not.toContain('غير مسموح')
  })

  it('does not throw on a valid small image', () => {
    expect(() =>
      enforceUploadGuard({
        req: { file: { mimetype: 'image/jpeg', size: 1024 } },      } as any),
    ).not.toThrow()
  })

  it('throws on an SVG (disallowed type)', () => {
    expect(() =>
      enforceUploadGuard({
        req: { file: { mimetype: 'image/svg+xml', size: 100 } },      } as any),
    ).toThrow(/غير مسموح/)
  })

  it('does not throw when there is no file (metadata-only update)', () => {
    expect(() =>
      enforceUploadGuard({
        req: { file: undefined },      } as any),
    ).not.toThrow()
  })
})

/**
 * Video, which the guard refused entirely until the in-body `videoFile` block existed.
 *
 * The interesting cases are the two boundaries, not the happy path: a container only Safari
 * plays, and a file bigger than the cap. Both fail in ways that are invisible until a reader
 * hits them — a .mov plays for the journalist who uploaded it and for nobody else, and an
 * oversized upload on the direct-to-Blob path leaves a stored object with no document.
 */
describe('Media upload guard — video', () => {
  it('accepts an MP4 the size a real newsroom clip actually is', () => {
    // ~72 MB: a 6.5-minute 848x480 h264 export, which is what a phone or a WhatsApp
    // hand-off produces. The old 10 MB image cap refused this by a factor of seven.
    expect(validateUpload({ mimeType: 'video/mp4', size: 72 * 1024 * 1024 })).toBe(true)
  })

  it('accepts WebM too', () => {
    expect(validateUpload({ mimeType: 'video/webm', size: 5 * 1024 * 1024 })).toBe(true)
  })

  it('refuses a video one byte over the cap, with the size message', () => {
    const result = validateUpload({ mimeType: 'video/mp4', size: MAX_VIDEO_BYTES + 1 })
    expect(result).not.toBe(true)
    expect(String(result)).toContain('الحد الأقصى')
    // ...and exactly at the cap is fine, so the boundary is `>` and not `>=`.
    expect(validateUpload({ mimeType: 'video/mp4', size: MAX_VIDEO_BYTES })).toBe(true)
  })

  it('refuses QuickTime — the container only Safari plays', () => {
    // An iPhone share sheet hands you .mov. Accepting it would publish a video that works
    // for the person who uploaded it and silently fails for Chrome and Firefox readers.
    const result = validateUpload({ mimeType: 'video/quicktime', size: 1024 })
    expect(result).not.toBe(true)
    expect(String(result)).toContain('غير مسموح')
    expect(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).not.toContain('video/quicktime')
  })

  it('applies the VIDEO cap to video and the IMAGE cap to images', () => {
    // The regression this pins: a single shared cap. A 72 MB "image" must still be refused
    // after the video cap was raised, or the guard has simply been turned off for everyone.
    const oversizedImage = validateUpload({ mimeType: 'image/png', size: MAX_IMAGE_BYTES + 1 })
    expect(oversizedImage).not.toBe(true)
    expect(String(oversizedImage)).toContain('الحد الأقصى')
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES)
  })

  it('is enforced through the hook on the client-upload path, where there is no file', () => {
    // clientUploads: the bytes went browser -> Blob and the create carries only declared
    // metadata. A 15.3 MB image once sailed past the 10 MB cap through exactly this path.
    expect(() =>
      enforceUploadGuard({
        data: { mimeType: 'video/mp4', filesize: MAX_VIDEO_BYTES + 1 },
        operation: 'create',
        req: { file: undefined },
      } as never),
    ).toThrow(/الحد الأقصى/)

    expect(() =>
      enforceUploadGuard({
        data: { mimeType: 'video/mp4', filesize: 72 * 1024 * 1024 },
        operation: 'create',
        req: { file: undefined },
      } as never),
    ).not.toThrow()
  })
})

/**
 * The size cap is measured from the uploaded BYTES, not from a number the uploader supplied.
 *
 * The guard used to read `file.size` before `file.data.length`, justified by a comment
 * claiming the admin's client-upload JSON omits `file.size`. It does not — `@payloadcms/ui`'s
 * Form serialises `size: file.size` and `addDataAndFileToRequest` copies it onto `req.file`.
 * So on the only path a large file can take in production (browser straight to Blob, because
 * Vercel kills request bodies over 4.5 MB), the cap was enforced against a client-chosen
 * number. Measured before the fix: a 12 MB PNG declaring `size: 1` was accepted.
 */
describe('Media upload guard — the bytes decide, not the declaration', () => {
  it('refuses an oversized file that declares itself tiny', () => {
    expect(() =>
      enforceUploadGuard({
        data: { filesize: 1, mimeType: 'image/png' },
        operation: 'create',
        req: { file: { mimetype: 'image/png', size: 1, data: Buffer.alloc(MAX_IMAGE_BYTES + 1) } },
      } as never),
    ).toThrow(/الحد الأقصى/)
  })

  it('accepts a small file that declares itself huge — the buffer rules both ways', () => {
    // A client that OVERSTATES must not have a legitimate upload refused, which is the other
    // half of trusting the measurement rather than the claim.
    expect(() =>
      enforceUploadGuard({
        data: { filesize: MAX_VIDEO_BYTES * 2, mimeType: 'image/png' },
        operation: 'create',
        req: { file: { mimetype: 'image/png', size: MAX_VIDEO_BYTES * 2, data: Buffer.alloc(1024) } },
      } as never),
    ).not.toThrow()
  })

  it('still checks the declared size when there are no bytes to measure', () => {
    // An empty buffer is falsy and must fall through to the declarations rather than read as
    // "0 bytes, under every cap" — the failure mode the original ordering was guarding against.
    expect(() =>
      enforceUploadGuard({
        data: { filesize: MAX_VIDEO_BYTES + 1, mimeType: 'video/mp4' },
        operation: 'create',
        req: { file: { mimetype: 'video/mp4', size: 0, data: Buffer.alloc(0) } },
      } as never),
    ).toThrow(/الحد الأقصى/)
  })
})

describe('Media upload guard (wiring)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('rejects an SVG upload through Payload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'blocked' },
        filePath: path.resolve(dirname, 'fixtures/evil.svg'),
      }),
    ).rejects.toThrow()
  })
})
