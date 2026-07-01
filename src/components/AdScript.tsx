'use client'

import { useEffect, useRef } from 'react'

import { injectHtml } from '@/lib/inject-html'

/**
 * Injects an ad-network unit (raw markup + inline JS) into the page: the body
 * markup runs at the slot (e.g. `<ins class="adsbygoogle">…` plus its push call),
 * and an optional per-ad head snippet is appended to <head> and removed on unmount.
 *
 * SECURITY: `bodyHtml`/`headHtml` are executed verbatim — a deliberate XSS surface,
 * safe only because authoring the `ads` collection is locked to admin/editor (see
 * src/collections/Ads.ts access). Never feed user input here.
 */
export function AdScript({ bodyHtml, headHtml }: { bodyHtml?: string | null; headHtml?: string | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    if (bodyHtml) injectHtml(host, bodyHtml)
    const headNodes = headHtml ? injectHtml(document.head, headHtml) : []

    return () => {
      if (host) host.innerHTML = ''
      headNodes.forEach((n) => n.parentNode?.removeChild(n))
    }
  }, [bodyHtml, headHtml])

  return <div ref={ref} className="h-full w-full" />
}
