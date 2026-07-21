'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = {
  label: string
  href: string
  children: { label: string; href: string }[]
}

/**
 * The category strip under the masthead. Split out of `Header` (a server component
 * that does the Payload fetching) purely so it can read `usePathname` and mark the
 * current section — the items themselves are still resolved server-side and handed
 * down as plain data.
 *
 * Sits in a wider container than the rest of the page so the sections spread across
 * the viewport instead of bunching up in the 1296px content column.
 */
export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  // A section is current on its own page and on anything nested under it, so an
  // article at /fashion/some-slug keeps موضة lit. Guard against '#' (an admin menu
  // entry with no target) and '/', which would otherwise match every route.
  const matches = (href: string) =>
    href !== '#' && href !== '/' && (pathname === href || pathname.startsWith(`${href}/`))

  const isActive = (item: NavItem) => matches(item.href) || item.children.some((c) => matches(c.href))

  return (
    <nav aria-label="الأقسام" className="border-t border-black/10 bg-surface">
      <ul className="lf-container flex items-stretch gap-1 overflow-x-auto text-base font-bold whitespace-nowrap md:justify-between md:gap-0 md:overflow-visible lg:text-lg">
        {items.map((item) => {
          const active = isActive(item)
          return (
            <li key={item.label} className="group relative md:flex-1 md:text-center">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  // `relative` anchors the active underline; the block+px keeps a
                  // comfortable tap target on mobile where items scroll horizontally.
                  'relative block rounded-md px-4 py-3 transition-colors',
                  active
                    ? 'text-brand-700 after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-brand-700'
                    : 'text-zinc-800 hover:bg-white/40 hover:text-brand-700',
                ].join(' ')}
              >
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <ul className="invisible absolute start-0 top-full z-50 min-w-44 rounded-lg border border-zinc-200 bg-white py-2 text-start text-base font-bold opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {item.children.map((child) => {
                    const childActive = matches(child.href)
                    return (
                      <li key={child.label}>
                        <Link
                          href={child.href}
                          aria-current={childActive ? 'page' : undefined}
                          className={
                            childActive
                              ? 'block px-4 py-2 text-brand-700'
                              : 'block px-4 py-2 text-zinc-700 hover:bg-brand-50 hover:text-brand-700'
                          }
                        >
                          {child.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
