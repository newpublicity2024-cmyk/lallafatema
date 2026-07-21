import Image from 'next/image'
import Link from 'next/link'

import type { Category } from '@/payload-types'
import { getNonEmptyCategories, getMainMenu, getSiteConfig } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { SearchIcon } from './icons'
import { MainNav } from './MainNav'
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
    <header className="sticky top-0 z-50 border-b border-black/10 bg-surface/95 backdrop-blur">
      <div className="lf-container flex items-center justify-between gap-4 py-3">
        {/* The logo is admin-managed (Site Settings → الهوية). Fall back to the
         * wordmark so the masthead is never blank if it hasn't been set. */}
        <Link href="/" aria-label={site.name} className="flex items-center">
          {site.logo?.url ? (
            <Image
              src={site.logo.url}
              alt={site.name}
              width={site.logo.width ?? 700}
              height={site.logo.height ?? 206}
              priority
              className="h-10 w-auto sm:h-12 lg:h-14"
            />
          ) : (
            <span className="text-2xl font-extrabold tracking-tight text-brand-700">{site.name}</span>
          )}
        </Link>
        <div className="flex items-center gap-4">
          <SocialLinks className="hidden text-zinc-700 sm:flex" links={site.social} />
          <Link href="/search" aria-label="بحث" className="text-zinc-700 transition-colors hover:text-brand-700">
            <SearchIcon width={22} height={22} />
          </Link>
        </div>
      </div>

      <MainNav items={items} />
    </header>
  )
}
