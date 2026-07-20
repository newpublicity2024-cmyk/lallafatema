import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { enforceUploadGuard } from '@/collections/Media'
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
