import React from 'react'
import type { Metadata } from 'next'
import { Tajawal } from 'next/font/google'
import './styles.css'

import { AdSlot } from '@/components/AdSlot'
import { ConsentBanner } from '@/components/ConsentBanner'
import { ConsentMode } from '@/components/ConsentMode'
import { OneSignalInit } from '@/components/OneSignalInit'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { SiteScripts } from '@/components/SiteScripts'
import { getSiteConfig } from '@/lib/queries'
import { SITE_URL, ogImageUrl, organizationJsonLd, webSiteJsonLd } from '@/lib/seo'

// Subsetted, self-hosted Arabic webfont. next/font handles subsetting,
// `font-display: swap`, and preloading automatically.
const arabic = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  display: 'swap',
  variable: '--font-arabic',
})

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  const image = ogImageUrl(cfg.defaultOgImage)
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: 'لالة فاطمة',
      template: '%s | لالة فاطمة',
    },
    description:
      'مجلة لالة فاطمة — مشاهير، موضة، جمال، صحة، مطبخ وأسلوب حياة للمرأة المغربية.',
    alternates: {
      canonical: '/',
      types: { 'application/rss+xml': `${SITE_URL}/rss.xml` },
    },
    openGraph: {
      type: 'website',
      url: SITE_URL,
      siteName: cfg.name,
      locale: 'ar_AR',
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
  }
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const cfg = await getSiteConfig()

  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="flex min-h-screen flex-col bg-white text-zinc-900">
        {cfg.consentEnabled && <ConsentMode />}
        <OneSignalInit />
        <JsonLd data={organizationJsonLd(cfg)} />
        <JsonLd data={webSiteJsonLd(cfg)} />
        {/* Admin-managed site-wide loaders (ad networks, GTM, verification). */}
        <SiteScripts headHtml={cfg.headScripts} bodyHtml={cfg.bodyScripts} />
        <Header />
        {/* Leaderboard ad below the sticky header — renders nothing when unscheduled. */}
        <AdSlot placement="header" className="mt-4 px-4" />
        <div className="flex-1">{children}</div>
        <Footer />
        {cfg.consentEnabled && <ConsentBanner policyUrl={cfg.privacyPolicyUrl} />}
      </body>
    </html>
  )
}
