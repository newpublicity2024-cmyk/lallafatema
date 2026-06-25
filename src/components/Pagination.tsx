import Link from 'next/link'

/** Simple RTL-aware pagination (link-based, no JS). */
export function Pagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null
  const href = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  )

  return (
    <nav aria-label="ترقيم الصفحات" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-brand-50">
          السابق
        </Link>
      )}
      {pages.map((p, i) => {
        const prev = pages[i - 1]
        const gap = prev && p - prev > 1
        return (
          <span key={p} className="flex items-center gap-2">
            {gap && <span className="text-zinc-400">…</span>}
            <Link
              href={href(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm ${
                p === page
                  ? 'bg-brand-600 font-bold text-white'
                  : 'border border-zinc-300 hover:bg-brand-50'
              }`}
            >
              {p}
            </Link>
          </span>
        )
      })}
      {page < totalPages && (
        <Link href={href(page + 1)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-brand-50">
          التالي
        </Link>
      )}
    </nav>
  )
}
