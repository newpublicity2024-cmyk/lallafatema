import { headers as getHeaders } from 'next/headers.js'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <span className="rounded-full bg-brand-50 px-4 py-1 text-sm font-medium text-brand-700">
        قيد الإنشاء
      </span>
      <h1 className="text-5xl font-extrabold tracking-tight text-brand-600 sm:text-6xl">
        لالة فاطمة
      </h1>
      <p className="text-lg leading-relaxed text-zinc-600">
        مجلة المرأة المغربية — مشاهير، موضة، جمال، صحة، مطبخ وأسلوب حياة.
        <br />
        نعمل حاليًا على إطلاق النسخة الجديدة من الموقع.
      </p>
      <a
        className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700"
        href={payloadConfig.routes.admin}
      >
        {user ? `مرحبًا، ${user.email}` : 'لوحة التحرير'}
      </a>
    </main>
  )
}
