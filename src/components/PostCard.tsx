import Link from 'next/link'

import type { Category, Post } from '@/payload-types'
import { categoryUrl, postUrl } from '@/lib/routes'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'
import { RelativeTime } from './RelativeTime'

type Variant = 'default' | 'hero' | 'overlay' | 'compact' | 'lead'

const categoryOf = (post: Post): Category | null =>
  post.category && typeof post.category === 'object' ? post.category : null

const isVideoPost = (post: Post): boolean => post.featuredType === 'video'

/** Small centered play badge overlaid on a video-post thumbnail. */
function PlayBadge({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <span
        className={`grid place-items-center rounded-full bg-brand-600/90 text-white shadow-lg ring-2 ring-white/30 ${
          small ? 'h-8 w-8' : 'h-12 w-12'
        }`}
      >
        <PlayIcon className="ms-0.5" width={small ? 16 : 24} height={small ? 16 : 24} />
      </span>
    </span>
  )
}

function Kicker({ category, light = false }: { category: Category | null; light?: boolean }) {
  if (!category) return null
  return (
    <Link
      href={categoryUrl(category.slug ?? '')}
      className={`inline-block text-xs font-bold ${light ? 'text-brand-200' : 'text-brand-600'} hover:underline`}
    >
      {category.name}
    </Link>
  )
}

export function PostCard({
  post,
  variant = 'default',
  fill = false,
  priority,
}: {
  post: Post
  variant?: Variant
  /** Overlay only: stretch to the parent's height instead of a fixed 16:9 ratio. */
  fill?: boolean
  /** Override the per-variant eager-load default (e.g. false for below-fold posters). */
  priority?: boolean
}) {
  const category = categoryOf(post)
  const isVideo = isVideoPost(post)
  const href = postUrl(post)
  // By default overlay/lead/hero eager-load; callers can force false (e.g. the
  // stacked mobile hero secondaries, which sit below the fold).
  const eager = priority ?? (variant === 'overlay' || variant === 'lead' || variant === 'hero')

  // Compact: small horizontal thumbnail + title (used in sidebars / hero lists).
  if (variant === 'compact') {
    return (
      <article className="group flex items-start gap-3.5">
        <Link href={href} className="relative block aspect-[4/3] w-32 flex-none overflow-hidden rounded-lg lg:w-40">
          {isVideo && <PlayBadge small />}
          <PostImage
            image={post.featuredImage}
            alt={post.title}
            sizes="(max-width: 1023px) 128px, 160px"
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="min-w-0">
          <Kicker category={category} />
          <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-zinc-900 group-hover:text-brand-700">
            <Link href={href}>{post.title}</Link>
          </h3>
          {/* zinc-600 (not -500): this compact variant renders on the .lf-band gray
              (#f0f0f0), where -500 is only 4.24:1 — -600 clears AA at 6.77:1. */}
          <RelativeTime date={post.publishedAt} className="mt-1 block text-xs text-zinc-600" />
        </div>
      </article>
    )
  }

  // Overlay: text sits over the image. Mobile = 4:5 poster w/ small title; md+ unchanged.
  if (variant === 'overlay') {
    return (
      <article
        className={`group relative overflow-hidden rounded-xl ${
          fill
            ? 'aspect-[4/5] md:aspect-video lg:aspect-auto lg:h-full'
            : 'aspect-[4/5] md:aspect-video'
        }`}
      >
        {isVideo && <PlayBadge />}
        <PostImage
          image={post.featuredImage}
          alt={post.title}
          sizes="(max-width: 768px) 100vw, 66vw"
          priority={eager}
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <Kicker category={category} light />
          <h2 className="mt-2 text-lg font-bold leading-tight text-white drop-shadow md:text-3xl">
            <Link href={href} className="after:absolute after:inset-0">
              {post.title}
            </Link>
          </h2>
          <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-white/70" />
        </div>
      </article>
    )
  }

  // Lead: large 16:9 image card with caption block (foochia lead style).
  if (variant === 'lead') {
    return (
      <article className="lf-card group flex flex-col">
        <Link href={href} className="relative block aspect-video overflow-hidden">
          {isVideo && <PlayBadge />}
          <PostImage
            image={post.featuredImage}
            alt={post.title}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={eager}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="p-4">
          <Kicker category={category} />
          <h3 className="mt-1 text-2xl font-medium leading-tight text-zinc-900 group-hover:text-brand-700">
            <Link href={href}>{post.title}</Link>
          </h3>
          {post.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>}
          <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-zinc-500" />
        </div>
      </article>
    )
  }

  const isHero = variant === 'hero'

  // Default / hero: foochia shadow-card — 4:3 image, padded caption, 20px/500 title.
  return (
    <article className="lf-card group flex flex-col">
      <Link
        href={href}
        className={`relative block ${isHero ? 'aspect-video' : 'aspect-[4/3]'} overflow-hidden`}
      >
        {isVideo && <PlayBadge />}
        <PostImage
          image={post.featuredImage}
          alt={post.title}
          sizes={isHero ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 50vw, 25vw'}
          priority={eager}
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="p-4">
        <Kicker category={category} />
        <h3
          className={`mt-1 font-medium leading-snug text-zinc-900 group-hover:text-brand-700 ${
            isHero ? 'text-2xl leading-tight' : 'text-xl'
          }`}
        >
          <Link href={href}>{post.title}</Link>
        </h3>
        {isHero && post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{post.excerpt}</p>
        )}
        <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-zinc-500" />
      </div>
    </article>
  )
}
