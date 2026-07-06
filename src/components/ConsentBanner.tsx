'use client'

import { useEffect, useState } from 'react'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  encodeConsent,
  readConsentCookie,
  toConsentModeSignals,
} from '@/lib/consent'

type Selections = { analytics: boolean; ads: boolean }

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function persist(sel: Selections) {
  document.cookie =
    `${CONSENT_COOKIE}=${encodeConsent(sel)}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax`
  const signals = toConsentModeSignals({ v: 1, ...sel })
  window.gtag?.('consent', 'update', signals)
  window.gtag?.('set', 'ads_data_redaction', !sel.ads)
}

/**
 * RTL cookie-consent banner. Fixed bottom overlay (zero CLS). Reads the lf-consent
 * cookie client-side in an effect (renders null on the server → no hydration mismatch),
 * opening only when no valid prior choice exists. Reopens on the 'lf:open-consent' event
 * so consent can be changed/withdrawn from the footer at any time.
 */
export function ConsentBanner({ policyUrl }: { policyUrl: string }) {
  const [open, setOpen] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [sel, setSel] = useState<Selections>({ analytics: false, ads: false })

  useEffect(() => {
    const stored = readConsentCookie()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setSel({ analytics: stored.analytics, ads: stored.ads })
    else setOpen(true)

    const reopen = () => {
      const cur = readConsentCookie()
      if (cur) setSel({ analytics: cur.analytics, ads: cur.ads })
      setCustomizing(true)
      setOpen(true)
    }
    window.addEventListener('lf:open-consent', reopen)
    return () => window.removeEventListener('lf:open-consent', reopen)
  }, [])

  if (!open) return null

  const resolve = (next: Selections) => {
    persist(next)
    setSel(next)
    setOpen(false)
    setCustomizing(false)
  }

  return (
    <div
      role="dialog"
      aria-label="إعدادات ملفات تعريف الارتباط"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="lf-container flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-zinc-700">
          نستخدم ملفات تعريف الارتباط لتحسين تجربتك وقياس الأداء وعرض إعلانات مناسبة.{' '}
          <a href={policyUrl} className="font-bold text-brand-600 underline">
            اعرف المزيد
          </a>
        </p>

        {customizing && (
          <div className="flex flex-col gap-3 rounded-md bg-zinc-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-500">
              <span>ضرورية (دائمًا مفعّلة)</span>
              <input type="checkbox" checked disabled aria-label="ضرورية" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-800">
              <span>إحصاءات</span>
              <input
                type="checkbox"
                checked={sel.analytics}
                onChange={(e) => setSel((s) => ({ ...s, analytics: e.target.checked }))}
                aria-label="إحصاءات"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-800">
              <span>إعلانات</span>
              <input
                type="checkbox"
                checked={sel.ads}
                onChange={(e) => setSel((s) => ({ ...s, ads: e.target.checked }))}
                aria-label="إعلانات"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => resolve({ analytics: true, ads: true })}
            className="rounded-md bg-brand-600 px-5 py-2 text-sm font-bold text-white"
          >
            قبول الكل
          </button>
          <button
            type="button"
            onClick={() => resolve({ analytics: false, ads: false })}
            className="rounded-md border border-brand-600 px-5 py-2 text-sm font-bold text-brand-600"
          >
            رفض الكل
          </button>
          {customizing ? (
            <button
              type="button"
              onClick={() => resolve(sel)}
              className="rounded-md bg-zinc-800 px-5 py-2 text-sm font-bold text-white"
            >
              حفظ التفضيلات
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCustomizing(true)}
              className="rounded-md px-5 py-2 text-sm font-bold text-zinc-700 underline"
            >
              تخصيص
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
