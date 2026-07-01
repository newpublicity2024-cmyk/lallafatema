'use client'

import { useEffect } from 'react'

import { injectHtml } from '@/lib/inject-html'

/**
 * Site-wide script/markup injection from Site Settings — the head loader (e.g.
 * AdSense `adsbygoogle.js`, GTM head, verification meta) appended to <head>, and
 * the body-start snippet (e.g. GTM noscript) inserted at the top of <body>. Runs
 * once after hydration; inline scripts execute via injectHtml's recreate pass.
 *
 * SECURITY: both blobs run verbatim — a deliberate XSS surface, safe only because
 * Site Settings is admin-only (see src/globals/SiteSettings.ts). Loaders added
 * dynamically after hydration still initialize correctly for ad networks.
 */
export function SiteScripts({ headHtml, bodyHtml }: { headHtml?: string; bodyHtml?: string }) {
  useEffect(() => {
    const added: Node[] = []
    if (headHtml) added.push(...injectHtml(document.head, headHtml))
    if (bodyHtml) added.push(...injectHtml(document.body, bodyHtml, true))
    return () => added.forEach((n) => n.parentNode?.removeChild(n))
  }, [headHtml, bodyHtml])

  return null
}
