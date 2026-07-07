import type { Metadata } from 'next'

import { buildMetadata } from '@/lib/seo'

export const metadata: Metadata = buildMetadata({
  title: 'تم تأكيد الاشتراك',
  path: '/newsletter/confirmed',
  noIndex: true,
})

export default function NewsletterConfirmedPage() {
  return (
    <div className="lf-container py-16 text-center">
      <h1 className="text-3xl font-bold text-zinc-900">تم تأكيد اشتراكك 🎉</h1>
      <p className="mt-4 text-zinc-600">
        شكرًا لاشتراكك في نشرة لالة فاطمة البريدية. ستصلك أحدث المقالات قريبًا.
      </p>
    </div>
  )
}
