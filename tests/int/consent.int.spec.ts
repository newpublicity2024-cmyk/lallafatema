import { describe, it, expect, afterEach } from 'vitest'

import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  decodeConsent,
  encodeConsent,
  toConsentModeSignals,
  consentModeStubScript,
  readConsentCookie,
} from '@/lib/consent'

describe('consent encoding', () => {
  it('round-trips a mixed selection', () => {
    const encoded = encodeConsent({ analytics: true, ads: false })
    expect(encoded).toBe('1:a=1,ads=0')
    expect(decodeConsent(encoded)).toEqual({ v: 1, analytics: true, ads: false })
  })

  it('returns null for absent or malformed values', () => {
    expect(decodeConsent(undefined)).toBeNull()
    expect(decodeConsent(null)).toBeNull()
    expect(decodeConsent('')).toBeNull()
    expect(decodeConsent('garbage')).toBeNull()
    expect(decodeConsent('1:a=2,ads=0')).toBeNull()
  })

  it('rejects an older cookie version (forces re-consent)', () => {
    expect(decodeConsent(`${CONSENT_VERSION + 1}:a=1,ads=1`)).toBeNull()
    expect(decodeConsent('0:a=1,ads=1')).toBeNull()
  })
})

describe('toConsentModeSignals', () => {
  it('denies everything when no choice was made', () => {
    expect(toConsentModeSignals(null)).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
  })

  it('maps ads → the three ad signals and analytics → analytics_storage', () => {
    expect(toConsentModeSignals({ v: 1, analytics: true, ads: false })).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    })
    expect(toConsentModeSignals({ v: 1, analytics: false, ads: true })).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'denied',
    })
  })
})

describe('consentModeStubScript', () => {
  const s = consentModeStubScript()
  it('defines gtag and sets a denied default with wait_for_update', () => {
    expect(s).toContain('function gtag()')
    expect(s).toContain("gtag('consent','default'")
    expect(s).toContain('wait_for_update')
    expect(s).toContain('ads_data_redaction')
  })
  it('reads the lf-consent cookie itself (no server data)', () => {
    expect(s).toContain(CONSENT_COOKIE)
  })
})

describe('readConsentCookie', () => {
  afterEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0`
  })
  it('returns null when the cookie is absent', () => {
    expect(readConsentCookie()).toBeNull()
  })
  it('parses a stored choice', () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeConsent({ analytics: false, ads: true })}; path=/`
    expect(readConsentCookie()).toEqual({ v: 1, analytics: false, ads: true })
  })
})
