import { beforeAll, describe, expect, it } from 'vitest'

import { subscribeAction } from '@/lib/newsletter-action'
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

describe('subscribeAction (inert without credentials)', () => {
  it('honeypot: a filled "company" field returns ok without subscribing', async () => {
    const fd = new FormData()
    fd.set('company', 'bot corp')
    fd.set('email', 'bot@example.com')
    await expect(subscribeAction({ status: 'idle' }, fd)).resolves.toEqual({ status: 'ok' })
  })

  it('a valid email while disabled returns disabled', async () => {
    const fd = new FormData()
    fd.set('email', 'reader@example.com')
    await expect(subscribeAction({ status: 'idle' }, fd)).resolves.toEqual({ status: 'disabled' })
  })
})
