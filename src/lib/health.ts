/**
 * Decide whether a /healthz request should run the deep DB-readiness probe.
 * Gated on HEALTHCHECK_SECRET: unset ⇒ always liveness-only; set ⇒ deep only when
 * the query param `deep` OR the `x-health-secret` header equals the secret.
 * DB status is never exposed to callers that don't hold the secret.
 */
export function healthDeepCheckRequested(input: {
  deepParam: string | null
  headerSecret: string | null
}): boolean {
  const secret = process.env.HEALTHCHECK_SECRET
  if (!secret) return false
  return input.deepParam === secret || input.headerSecret === secret
}
