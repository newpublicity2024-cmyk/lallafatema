import Link from 'next/link'

import { getCategories } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { SITE } from '@/lib/site'
import { SearchIcon } from './icons'
import { SocialLinks } from './SocialLinks'

export async function Header() {
  const categories = await getCategories()
  // Top-level categories only (parent is null/undefined).
  const topLevel = categories.filter((c) => !c.parent)

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-brand-600">
          {SITE.name}
        </Link>

        <div className="flex items-center gap-4">
          <SocialLinks className="hidden text-zinc-500 sm:flex" />
          <Link
            href="/search"
            aria-label="بحث"
            className="text-zinc-600 transition-colors hover:text-brand-600"
          >
            <SearchIcon width={22} height={22} />
          </Link>
        </div>
      </div>

      <nav aria-label="الأقسام" className="border-t border-zinc-100 bg-white">
        <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1 text-sm font-bold whitespace-nowrap">
          {topLevel.map((cat) => (
            <li key={cat.id}>
              <Link
                href={categoryUrl(cat.slug ?? '')}
                className="block rounded-md px-3 py-2 text-zinc-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
