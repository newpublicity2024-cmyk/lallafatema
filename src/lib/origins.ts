/**
 * Origins Payload trusts for CSRF and CORS — the canonical production URL plus whatever
 * NEXT_PUBLIC_SERVER_URL points at (localhost in dev, a preview URL in previews). Never
 * '*'. Deduped, trailing slashes stripped. Pure (reads only process.env).
 */
const CANONICAL_ORIGIN = 'https://lallafatema.ma'

export function allowedOrigins(): string[] {
  const origins = new Set<string>([CANONICAL_ORIGIN])
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim()
  if (envUrl && envUrl !== '*') origins.add(envUrl.replace(/\/+$/, ''))
  return [...origins]
}
