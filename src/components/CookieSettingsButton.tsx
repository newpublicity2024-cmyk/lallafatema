'use client'

/**
 * Footer trigger that reopens the consent banner (for withdrawing/changing consent —
 * required for GDPR "withdraw as easily as give"). Fires the window event the banner
 * listens for. Rendered by the (server) Footer as a client child.
 */
export function CookieSettingsButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('lf:open-consent'))}
      className={className}
    >
      إعدادات ملفات تعريف الارتباط
    </button>
  )
}
