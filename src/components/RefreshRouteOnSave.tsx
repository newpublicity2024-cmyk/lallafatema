'use client'

import { RefreshRouteOnSave as PayloadRefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

/**
 * Refreshes the preview route whenever Payload autosaves, giving editors a
 * near-live preview of their drafts against the real frontend.
 *
 * WHY THE EARLY RETURN. This used to pass `process.env.NEXT_PUBLIC_SERVER_URL || ''`.
 * `NEXT_PUBLIC_*` is inlined at BUILD time, so a build made without that variable ships a
 * client bundle whose serverURL is the empty string — and Payload's listener then calls
 * `postMessage(msg, '')`, which throws `Invalid target origin ''`. The throw is not
 * contained: it propagates out of this client component and React unmounts the subtree,
 * so the editor loses THE ENTIRE ARTICLE, not merely the auto-refresh. Observed exactly
 * that way against a production build made without the variable.
 *
 * Rendering nothing instead degrades honestly: the preview still shows the draft, it just
 * does not refresh itself until the editor reloads. A missing convenience beats a blank page.
 */
export function RefreshRouteOnSave() {
  const router = useRouter()
  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL

  if (!serverURL) return null

  return <PayloadRefreshRouteOnSave refresh={() => router.refresh()} serverURL={serverURL} />
}
