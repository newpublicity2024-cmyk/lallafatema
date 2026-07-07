import { beforeAll, describe, expect, it } from 'vitest'

import { getPushConfig, pushEnabled } from '@/lib/push'

// Runs WITHOUT OneSignal config → verifies the inert contract: nothing is enabled.
beforeAll(() => {
  delete process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  delete process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID
})

describe('push gate (inert without config)', () => {
  it('is disabled when the public app id is absent', () => {
    expect(pushEnabled()).toBe(false)
  })

  it('getPushConfig returns null when disabled', () => {
    expect(getPushConfig()).toBeNull()
  })
})
