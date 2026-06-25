import Link from 'next/link'

import { getCategories } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { FOOTER_PAGES, NEWPUB_LINKS, SITE } from '@/lib/site'
import { SocialLinks } from './SocialLinks'

export async function Footer() {
  const categories = await getCategories()
  const topLevel = categories.filter((c) => !c.parent)

  return (
    <footer className="mt-12 border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="text-xl font-extrabold text-brand-600">{SITE.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">{SITE.tagline}</p>
          <SocialLinks className="mt-4 text-zinc-500" />
        </div>

        <nav aria-label="الأقسام">
          <h4 className="mb-3 font-bold text-zinc-900">الأقسام</h4>
          <ul className="grid grid-cols-2 gap-y-2 text-sm text-zinc-600">
            {topLevel.map((cat) => (
              <li key={cat.id}>
                <Link href={categoryUrl(cat.slug ?? '')} className="hover:text-brand-600">
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="روابط">
          <h4 className="mb-3 font-bold text-zinc-900">روابط</h4>
          <ul className="space-y-2 text-sm text-zinc-600">
            {FOOTER_PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="hover:text-brand-600">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="شبكة NewPub">
          <h4 className="mb-3 font-bold text-zinc-900">شبكة NewPub</h4>
          <ul className="space-y-2 text-sm text-zinc-600">
            {NEWPUB_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {SITE.name}. جميع الحقوق محفوظة.
      </div>
    </footer>
  )
}
