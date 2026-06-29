import Link from 'next/link'

import type { Category, Post } from '@/payload-types'
import { categoryUrl, postUrl } from '@/lib/routes'
import { PostImage } from './PostImage'
import { RelativeTime } from './RelativeTime'

type Variant = 'default' | 'hero' | 'overlay' | 'compact' | 'lead'

const categoryOf = (post: Post): Category | null =>
  post.category && typeof post.category === 'object' ? post.category : null

const isExclusive = (category: Category | null): boolean => category?.slug === 'exclusive'

/** Magenta "حصري" pill pinned to the top corner of a thumbnail (foochia cue). */
function ExclusiveBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`absolute top-2 end-2 z-10 rounded-full bg-brand-600 font-bold text-white shadow-sm ${
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      حصري
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

export function PostCard({ post, variant = 'default' }: { post: Post; variant?: Variant }) {
  const category = categoryOf(post)
  const exclusive = isExclusive(category)
  const href = postUrl(post)

  // Compact: small horizontal thumbnail + title (used in sidebars / hero lists).
  if (variant === 'compact') {
    return (
      <article className="group flex items-start gap-3">
        <Link href={href} className="relative aspect-square w-20 flex-none overflow-hidden rounded-lg">
          {exclusive && <ExclusiveBadge small />}
          <PostImage image={post.featuredImage} alt={post.title} sizes="80px" />
        </Link>
        <div className="min-w-0">
          <Kicker category={category} />
          <h3 className="mt-1 line-clamp-3 text-sm font-bold leading-snug text-zinc-800 group-hover:text-brand-700">
            <Link href={href}>{post.title}</Link>
          </h3>
          <RelativeTime date={post.publishedAt} className="mt-1 block text-xs text-zinc-400" />
        </div>
      </article>
    )
  }

  // Overlay: text sits over the image (used for hero feature).
  if (variant === 'overlay') {
    return (
      <article className="group relative aspect-[4/3] overflow-hidden rounded-2xl">
        {exclusive && <ExclusiveBadge />}
        <PostImage
          image={post.featuredImage}
          alt={post.title}
          sizes="(max-width: 768px) 100vw, 66vw"
          priority
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <Kicker category={category} light />
          <h2 className="mt-2 text-xl font-extrabold leading-tight text-white drop-shadow sm:text-3xl">
            <Link href={href} className="after:absolute after:inset-0">
              {post.title}
            </Link>
          </h2>
          <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-white/70" />
        </div>
      </article>
    )
  }

  // Lead: large image-top card with a white caption block (layalina editorial style).
  if (variant === 'lead') {
    return (
      <article className="group flex flex-col">
        <Link href={href} className="relative aspect-[16/10] overflow-hidden rounded-xl">
          {exclusive && <ExclusiveBadge />}
          <PostImage
            image={post.featuredImage}
            alt={post.title}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="mt-3">
          <Kicker category={category} />
          <h3 className="mt-1 text-2xl font-extrabold leading-tight text-zinc-900 group-hover:text-brand-700 sm:text-3xl">
            <Link href={href}>{post.title}</Link>
          </h3>
          {post.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>}
          <RelativeTime date={post.publishedAt} className="mt-2 block text-xs text-zinc-400" />
        </div>
      </article>
    )
  }

  const isHero = variant === 'hero'

  // Default / hero: image on top, kicker, title, excerpt, time.
  return (
    <article className="group flex flex-col">
      <Link
        href={href}
        className={`relative ${isHero ? 'aspect-[16/10] rounded-xl' : 'aspect-[4/3] rounded-lg'} overflow-hidden`}
      >
        {exclusive && <ExclusiveBadge />}
        <PostImage
          image={post.featuredImage}
          alt={post.title}
          sizes={isHero ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 50vw, 25vw'}
          priority={isHero}
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="mt-2.5">
        <Kicker category={category} />
        <h3
          className={`mt-1 font-extrabold leading-snug text-zinc-900 group-hover:text-brand-700 ${
            isHero ? 'text-2xl leading-tight' : 'text-[15px]'
          }`}
        >
          <Link href={href}>{post.title}</Link>
        </h3>
        {isHero && post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{post.excerpt}</p>
        )}
        <RelativeTime date={post.publishedAt} className="mt-1.5 block text-xs text-zinc-400" />
      </div>
    </article>
  )
}
