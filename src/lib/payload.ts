import { getPayload } from 'payload'
import { cache } from 'react'

import config from '@/payload.config'

/**
 * Cached Payload Local API client for use in Server Components / route handlers.
 * `cache` dedupes the init within a single request — no extra network hop to the DB.
 */
export const getPayloadClient = cache(async () => {
  return getPayload({ config: await config })
})
