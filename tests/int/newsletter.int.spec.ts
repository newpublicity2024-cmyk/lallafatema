import { beforeAll, describe, expect, it } from 'vitest'

import { isValidEmail, newsletterEnabled, subscribe } from '@/lib/newsletter'

// Every suite in this file runs WITHOUT Brevo credentials → verifies the inert
// contract: the provider never contacts Brevo and never throws when disabled.
// Top-level beforeAll so later-appended suites (the action tests) are covered too.
beforeAll(() => {
  delete process.env.BREVO_API_KEY
  delete process.env.BREVO_LIST_ID
  delete process.env.BREVO_DOI_TEMPLATE_ID
})

describe('newsletter provider (inert without credentials)', () => {
  it('is disabled when the Brevo env vars are absent', () => {
    expect(newsletterEnabled()).toBe(false)
  })

  it('subscribe returns { status: "disabled" } without contacting Brevo', async () => {
    await expect(subscribe('reader@example.com')).resolves.toEqual({ status: 'disabled' })
  })

  it('validates email format', () => {
    expect(isValidEmail('reader@example.com')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})
