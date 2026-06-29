'use client'

import { RefreshRouteOnSave as PayloadRefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

/**
 * Refreshes the preview route whenever Payload autosaves, giving editors a
 * near-live preview of their drafts against the real frontend.
 */
export function RefreshRouteOnSave() {
  const router = useRouter()
  return (
    <PayloadRefreshRouteOnSave
      refresh={() => router.refresh()}
      serverURL={process.env.NEXT_PUBLIC_SERVER_URL || ''}
    />
  )
}
