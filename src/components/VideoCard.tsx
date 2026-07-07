import Link from 'next/link'

import type { Video } from '@/payload-types'
import { videoWatchUrl } from '@/lib/routes'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'

type Variant = 'lead' | 'list'

function PlayButton({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-300 group-hover:scale-105"
    >
      <span
        className={`grid place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20 ${
          large ? 'h-16 w-16' : 'h-10 w-10'
        }`}
      >
        <PlayIcon className="ms-0.5" width={large ? 30 : 20} height={large ? 30 : 20} />
      </span>
    </span>
  )
}

function Duration({ value }: { value?: string | null }) {
  if (!value) return null
  return (
    <span className="absolute bottom-2 end-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
      {value}
    </span>
  )
}

/**
 * Video thumbnail that LINKS to the watch page (/videos/<slug>-<id>). The embed
 * itself lives on the watch page (VideoPlayer), so cards are navigational only —
 * a plain server component. Always rendered inside the dark VideoSection band.
 */
export function VideoCard({ video, variant = 'list' }: { video: Video; variant?: Variant }) {
  const isLead = variant === 'lead'
  const sizes = isLead ? '(max-width: 768px) 100vw, 50vw' : '160px'
  const href = videoWatchUrl(video)

  const frame = (
    <Link
      href={href}
      className="relative block aspect-video w-full overflow-hidden rounded-xl bg-brand-900"
    >
      <PostImage
        image={video.thumbnail}
        alt={video.title}
        sizes={sizes}
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <PlayButton large={isLead} />
      <Duration value={video.duration} />
    </Link>
  )

  if (isLead) {
    return (
      <article className="group">
        {frame}
        <h3 className="mt-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          <Link href={href}>{video.title}</Link>
        </h3>
        {video.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/70">{video.description}</p>
        )}
      </article>
    )
  }

  return (
    <article className="group flex items-start gap-3">
      <div className="w-40 flex-none">{frame}</div>
      <div className="min-w-0 pt-1">
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white/90 group-hover:text-brand-200">
          <Link href={href}>{video.title}</Link>
        </h3>
        {video.duration && (
          <span className="mt-1 block text-xs text-white/50 tabular-nums">{video.duration}</span>
        )}
      </div>
    </article>
  )
}
