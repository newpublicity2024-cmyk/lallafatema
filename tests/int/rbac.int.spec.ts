import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'

let payload: Payload

describe('RBAC', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('does not expose users to unauthenticated (anonymous) reads', async () => {
    // overrideAccess:false + no `user` => the `read: Boolean(user)` access returns
    // the boolean `false` (not a query constraint), so Payload's find operation
    // throws its `Forbidden` error (HTTP 403) rather than returning an empty result
    // set. Either outcome means the same thing: anonymous callers cannot read
    // `users`. Assert on the error's name/status, not its (localized) message text.
    await expect(
      payload.find({ collection: 'users', overrideAccess: false }),
    ).rejects.toMatchObject({ name: 'Forbidden', status: 403 })
  })
})
