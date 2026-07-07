/** OneSignal web push is enabled only when the public app id is configured. */
export function pushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID)
}

export type PushConfig = { appId: string; safariWebId?: string }

/**
 * Client-safe push config, or null when disabled. `NEXT_PUBLIC_*` vars are inlined at
 * build time in the client bundle; here (and in tests) they are read from process.env.
 */
export function getPushConfig(): PushConfig | null {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  if (!appId) return null
  const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID
  return { appId, ...(safariWebId ? { safariWebId } : {}) }
}
