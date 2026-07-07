'use client'

import { useEffect } from 'react'

import { getPushConfig } from '@/lib/push'

const SDK_SRC = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'

type OneSignalApi = { init: (opts: { appId: string; safari_web_id?: string }) => Promise<void> }

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalApi) => void>
  }
}

/**
 * Loads the OneSignal web-push SDK — but only when configured, and only on idle so it
 * never competes with LCP/hydration (CWV-safe). Renders nothing; OneSignal's own prompt
 * handles opt-in. Fully inert without NEXT_PUBLIC_ONESIGNAL_APP_ID: no script, no service
 * worker, no network.
 */
export function OneSignalInit() {
  useEffect(() => {
    const cfg = getPushConfig()
    if (!cfg) return
    // Guard against double injection (e.g. fast client navigation).
    if (document.querySelector(`script[src="${SDK_SRC}"]`)) return

    const load = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || []
      window.OneSignalDeferred.push((OneSignal) => {
        void OneSignal.init({
          appId: cfg.appId,
          ...(cfg.safariWebId ? { safari_web_id: cfg.safariWebId } : {}),
        })
      })
      const s = document.createElement('script')
      s.src = SDK_SRC
      s.async = true
      document.head.appendChild(s)
    }

    // Load only once the browser is idle, well after the critical path.
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(load)
    } else {
      const t = setTimeout(load, 3000)
      return () => clearTimeout(t)
    }
  }, [])

  return null
}
