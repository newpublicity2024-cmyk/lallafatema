/**
 * Google Analytics 4 (gtag.js), site-wide. Renders Google's standard two-tag
 * snippet: the async loader — React hoists an async <script src> into <head> —
 * and the inline config, which executes at parse time. Takes no server data of
 * its own (the id is passed in, already fetched by the layout), so it never opts
 * a route out of static rendering.
 *
 * CONSENT: must render AFTER <ConsentMode />. That stub sets the Consent Mode v2
 * defaults (analytics_storage denied until the reader chooses) and defines
 * dataLayer/gtag first; gtag.js then honours those signals, and ConsentBanner's
 * `consent update` applies later changes. The snippet below redefines
 * dataLayer/gtag itself — idempotent, and required for the case where
 * `consentEnabled` is off and no stub renders.
 *
 * SECURITY: the inline string interpolates only an id matched against GA_ID_RE,
 * so dangerouslySetInnerHTML carries no injection risk even though `analyticsId`
 * is admin-editable.
 */

/** Built-in property, used when Site Settings › معرّف التحليلات is empty. */
export const GA_MEASUREMENT_ID = 'G-VTX278FNG3'

const GA_ID_RE = /^G-[A-Z0-9]{4,20}$/i

/**
 * Resolves the measurement id: a valid Site Settings value wins, otherwise the
 * built-in one. A malformed entry falls back rather than disabling analytics, so
 * an admin typo cannot silently stop collection.
 */
export function resolveMeasurementId(configured?: string | null): string {
  const id = configured?.trim()
  return id && GA_ID_RE.test(id) ? id : GA_MEASUREMENT_ID
}

export function GoogleAnalytics({ id }: { id?: string | null }) {
  const measurementId = resolveMeasurementId(id)
  const config =
    'window.dataLayer = window.dataLayer || [];' +
    'function gtag(){dataLayer.push(arguments);}' +
    "gtag('js', new Date());" +
    `gtag('config', '${measurementId}');`

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} />
      <script dangerouslySetInnerHTML={{ __html: config }} />
    </>
  )
}
