import { consentModeStubScript } from '@/lib/consent'

/**
 * Google Consent Mode v2 default stub. A static inline <script> in the initial HTML,
 * mounted as the first child of <body> — it executes at parse time, before hydration
 * and before SiteScripts injects the ad-network loader (that runs in a post-hydration
 * effect). The script reads the lf-consent cookie itself, so the layout never calls
 * cookies() and the page stays statically rendered (ISR).
 *
 * SECURITY: the injected string is a fixed, code-authored constant (no user/DB input),
 * so dangerouslySetInnerHTML carries no injection risk here.
 */
export function ConsentMode() {
  return <script dangerouslySetInnerHTML={{ __html: consentModeStubScript() }} />
}
