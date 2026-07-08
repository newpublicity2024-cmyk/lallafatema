import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
let payload: Payload

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
