/**
 * Consent core — the single source of truth for cookie storage, encoding, and the
 * Google Consent Mode v2 signal mapping. Pure and framework-free so it is unit-tested
 * in isolation; the React components (ConsentMode, ConsentBanner) only wrap this.
 *
 * Cookie contract: name `lf-consent`, value `1:a=<0|1>,ads=<0|1>`. The leading number
 * is the schema version — bumping it invalidates old cookies and forces re-consent.
 */
export const CONSENT_COOKIE = 'lf-consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 15552000 // 180 days, in seconds

export type ConsentState = { v: number; analytics: boolean; ads: boolean }

export type ConsentSignal = 'granted' | 'denied'
export type ConsentSignals = {
  ad_storage: ConsentSignal
  ad_user_data: ConsentSignal
  ad_personalization: ConsentSignal
  analytics_storage: ConsentSignal
}

/** Compact cookie form, e.g. `1:a=1,ads=0`. */
export function encodeConsent(sel: { analytics: boolean; ads: boolean }): string {
  return `${CONSENT_VERSION}:a=${sel.analytics ? 1 : 0},ads=${sel.ads ? 1 : 0}`
}

/** Parse the cookie. Returns null for absent / malformed / wrong-version values. */
export function decodeConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null
  const m = /^(\d+):a=([01]),ads=([01])$/.exec(raw.trim())
  if (!m) return null
  const v = Number(m[1])
  if (v !== CONSENT_VERSION) return null
  return { v, analytics: m[2] === '1', ads: m[3] === '1' }
}

/** Map a stored state (or null = nothing chosen yet) to Consent Mode v2 signals. */
export function toConsentModeSignals(state: ConsentState | null): ConsentSignals {
  const ads: ConsentSignal = state?.ads ? 'granted' : 'denied'
  const analytics: ConsentSignal = state?.analytics ? 'granted' : 'denied'
  return {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: analytics,
  }
}

/** Client-side cookie read (safe to import in a server component; guarded for SSR). */
export function readConsentCookie(): ConsentState | null {
  if (typeof document === 'undefined') return null
  const m = new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`).exec(document.cookie)
  return decodeConsent(m ? decodeURIComponent(m[1]) : null)
}

/**
 * The static inline <head>/<body-top> stub. Identical on every page (no server data,
 * so it never opts a route out of static rendering). Defines gtag, reads the
 * `lf-consent` cookie itself, and sets the Consent Mode v2 default before any Google
 * loader runs. `wait_for_update` is only emitted before a choice exists.
 */
export function consentModeStubScript(): string {
  return (
    'window.dataLayer=window.dataLayer||[];' +
    'function gtag(){dataLayer.push(arguments);}' +
    '(function(){' +
    `var m=/(?:^|; )${CONSENT_COOKIE}=([^;]*)/.exec(document.cookie);` +
    "var ads='denied',an='denied',chosen=false;" +
    'if(m){var mm=/^1:a=([01]),ads=([01])$/.exec(decodeURIComponent(m[1]));' +
    "if(mm){chosen=true;an=mm[1]==='1'?'granted':'denied';ads=mm[2]==='1'?'granted':'denied';}}" +
    'var def={ad_storage:ads,ad_user_data:ads,ad_personalization:ads,' +
    "analytics_storage:an,functionality_storage:'granted',security_storage:'granted'};" +
    'if(!chosen)def.wait_for_update=500;' +
    "gtag('consent','default',def);" +
    "gtag('set','ads_data_redaction',ads==='denied');" +
    '})();'
  )
}
