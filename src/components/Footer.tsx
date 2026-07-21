import Link from 'next/link'

import { getNonEmptyCategories, getSiteConfig } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { AdSlot } from './AdSlot'
import { CookieSettingsButton } from './CookieSettingsButton'
import { NewsletterSignup } from './NewsletterSignup'
import { SocialLinks } from './SocialLinks'

export async function Footer() {
  const [categories, site] = await Promise.all([getNonEmptyCategories(), getSiteConfig()])
  const topLevel = categories.filter((c) => !c.parent)

  return (
    <footer className="mt-12 border-t border-black/10 bg-surface">
      {/* Footer ad — renders nothing when none is scheduled. */}
      <AdSlot placement="footer" className="my-6 px-4" />
      {/* Newsletter signup — renders inert (graceful) without Brevo creds. */}
      <div className="lf-container pt-6">
        <NewsletterSignup />
      </div>
      <div className="lf-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="text-xl font-extrabold text-brand-700">{site.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">{site.tagline}</p>
          <SocialLinks className="mt-4 text-zinc-700" links={site.social} />
        </div>

        <nav aria-label="الأقسام">
          <h4 className="mb-3 font-bold text-zinc-900">الأقسام</h4>
          <ul className="grid grid-cols-2 gap-y-2 text-sm text-zinc-600">
            {topLevel.map((cat) => (
              <li key={cat.id}>
                <Link href={categoryUrl(cat.slug ?? '')} className="hover:text-brand-700">
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="روابط">
          <h4 className="mb-3 font-bold text-zinc-900">روابط</h4>
          <ul className="space-y-2 text-sm text-zinc-600">
            {site.footerPages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="hover:text-brand-700">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="شبكة NewPub">
          <h4 className="mb-3 font-bold text-zinc-900">شبكة NewPub</h4>
          <ul className="space-y-2 text-sm text-zinc-600">
            {site.newpubLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-brand-700">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-zinc-200 py-4 text-center text-xs text-zinc-700">
        <span>© {new Date().getFullYear()} {site.name}. جميع الحقوق محفوظة.</span>
        {site.consentEnabled && (
          <CookieSettingsButton className="text-brand-700 underline hover:text-brand-800" />
        )}
      </div>
    </footer>
  )
}
