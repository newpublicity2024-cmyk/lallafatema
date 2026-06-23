import React from 'react'
import { Tajawal } from 'next/font/google'
import './styles.css'

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
      <body>{children}</body>
    </html>
  )
}
