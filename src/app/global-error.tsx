'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Root error boundary: reports to Sentry (no-op when uninitialized) and renders a
// minimal Arabic RTL fallback. Must define its own <html>/<body>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>حدث خطأ ما</h1>
        <p style={{ margin: 0 }}>نعتذر، حدث خطأ غير متوقع. حاول تحديث الصفحة.</p>
      </body>
    </html>
  )
}
