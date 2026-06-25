import React from 'react'
import { Tajawal } from 'next/font/google'
import './styles.css'

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

// Subsetted, self-hosted Arabic webfont. next/font handles subsetting,
// `font-display: swap`, and preloading automatically.
const arabic = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  display: 'swap',
  variable: '--font-arabic',
})

export const metadata = {
  title: {
    default: 'لالة فاطمة',
    template: '%s | لالة فاطمة',
  },
  description: 'مجلة لالة فاطمة — مشاهير، موضة، جمال، صحة، مطبخ وأسلوب حياة للمرأة المغربية.',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="flex min-h-screen flex-col bg-white text-zinc-900">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  )
}
