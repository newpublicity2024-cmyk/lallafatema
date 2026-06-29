import Link from 'next/link'

/**
 * Section heading (foochia): bold 28px title with a short magenta underline, plus
 * an optional gray "المزيد" pill on the opposite side. `light` for dark bands.
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
    <div className="mb-6 flex items-center justify-between gap-4">
      <h2
        className={`relative pb-2 text-[28px] leading-none font-bold tracking-tight after:absolute after:bottom-0 after:start-0 after:h-1 after:w-10 after:rounded-full after:bg-brand-600 ${
          light ? 'text-white' : 'text-zinc-900'
        }`}
      >
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className={`grid h-9 shrink-0 place-items-center rounded-md px-3 text-base font-normal transition-colors ${
            light
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
          }`}
        >
          المزيد ←
        </Link>
      )}
    </div>
  )
}
