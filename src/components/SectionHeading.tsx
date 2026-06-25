import Link from 'next/link'

/** Layalina-style section heading: brand accent bar (start side) + "see all" link. */
export function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between border-b border-zinc-200 pb-2">
      <h2 className="border-s-4 border-brand-600 ps-3 text-xl font-extrabold text-zinc-900">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          عرض الكل ←
        </Link>
      )}
    </div>
  )
}
