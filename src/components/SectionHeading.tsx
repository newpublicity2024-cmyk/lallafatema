import Link from 'next/link'

/**
 * Section heading: bold title with a short magenta underline (foochia/layalina),
 * plus an optional "عرض الكل" pill on the opposite side. `light` for dark bands.
 */
export function SectionHeading({
  title,
  href,
  light = false,
}: {
  title: string
  href?: string
  light?: boolean
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2
        className={`relative pb-2 text-2xl font-extrabold tracking-tight after:absolute after:bottom-0 after:start-0 after:h-1 after:w-12 after:rounded-full after:bg-brand-600 sm:text-3xl ${
          light ? 'text-white' : 'text-zinc-900'
        }`}
      >
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold transition-colors ${
            light
              ? 'text-brand-200 hover:bg-white/10'
              : 'text-brand-600 hover:bg-brand-50'
          }`}
        >
          عرض الكل ←
        </Link>
      )}
    </div>
  )
}
