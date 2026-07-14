import Link from 'next/link'

import type { Post } from '@/payload-types'
import { postUrl } from '@/lib/routes'
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

/**
 * Video-post thumbnail for the dark homepage band. Navigational server component —
 * it LINKS to the article (/<category>/<slug>-<id>), where the video plays.
 */
export function VideoCard({ post, variant = 'list' }: { post: Post; variant?: Variant }) {
  const isLead = variant === 'lead'
  const sizes = isLead ? '(max-width: 768px) 100vw, 50vw' : '160px'
  const href = postUrl(post)

  const frame = (
    <Link
      href={href}
      className="relative block aspect-video w-full overflow-hidden rounded-xl bg-brand-900"
    >
      <PostImage
        image={post.featuredImage}
        alt={post.title}
        sizes={sizes}
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <PlayButton large={isLead} />
    </Link>
  )

  if (isLead) {
    return (
      <article className="group">
        {frame}
        <h3 className="mt-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          <Link href={href}>{post.title}</Link>
        </h3>
        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/70">{post.excerpt}</p>
        )}
      </article>
    )
  }

  return (
    <article className="group flex items-start gap-3">
      <div className="w-40 flex-none">{frame}</div>
      <div className="min-w-0 pt-1">
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white/90 group-hover:text-brand-200">
          <Link href={href}>{post.title}</Link>
        </h3>
      </div>
    </article>
  )
}
