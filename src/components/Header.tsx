import Link from 'next/link'

import type { Category } from '@/payload-types'
import { getNonEmptyCategories, getMainMenu, getSiteConfig } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { SearchIcon } from './icons'
import { SocialLinks } from './SocialLinks'

type LinkLike = { label: string; category?: number | Category | null; url?: string | null }

const hrefOf = (item: LinkLike): string => {
  if (item.category && typeof item.category === 'object') return categoryUrl(item.category.slug ?? '')
  return item.url || '#'
}

export async function Header() {
  const [menu, categories, site] = await Promise.all([
    getMainMenu(),
    getNonEmptyCategories(),
    getSiteConfig(),
  ])

  // Use the admin-defined menu if present; otherwise fall back to top-level categories.
  const baseItems: { label: string; href: string; children: { label: string; href: string }[] }[] =
    menu.items && menu.items.length > 0
      ? menu.items.map((item) => ({
          label: item.label,
          href: hrefOf(item),
          children: (item.children ?? []).map((c) => ({ label: c.label, href: hrefOf(c) })),
        }))
      : categories
          .filter((c) => !c.parent && c.slug !== 'video')
          .map((c) => ({ label: c.name, href: categoryUrl(c.slug ?? ''), children: [] }))

  // Always expose the videos section and magazine archive (guaranteed floor
  // items, independent of the admin menu / category fallback). Admins can
  // also add their own entries.
  const items = [
    ...baseItems,
    { label: 'فيديو', href: '/videos', children: [] },
    { label: 'المجلة', href: '/magazine', children: [] },
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="lf-container flex items-center justify-between gap-4 py-3">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-brand-600">
          {site.name}
        </Link>
        <div className="flex items-center gap-4">
          <SocialLinks className="hidden text-zinc-500 sm:flex" links={site.social} />
          <Link href="/search" aria-label="بحث" className="text-zinc-600 transition-colors hover:text-brand-600">
            <SearchIcon width={22} height={22} />
          </Link>
        </div>
      </div>

      <nav aria-label="الأقسام" className="border-t border-zinc-100 bg-white">
        <ul className="lf-container flex items-center gap-1 overflow-x-auto py-1 text-sm font-bold whitespace-nowrap">
          {items.map((item) => (
            <li key={item.label} className="group relative">
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-zinc-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <ul className="invisible absolute start-0 top-full z-50 min-w-44 rounded-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {item.children.map((child) => (
                    <li key={child.label}>
                      <Link
                        href={child.href}
                        className="block px-4 py-2 text-zinc-700 hover:bg-brand-50 hover:text-brand-700"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
