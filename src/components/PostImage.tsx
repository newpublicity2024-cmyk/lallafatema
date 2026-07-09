import Image from 'next/image'

import type { Media } from '@/payload-types'

type ImageRef = number | Media | null | undefined

/**
 * Renders a media image with `fill` (parent must reserve the aspect ratio →
 * zero CLS). Falls back to a brand gradient placeholder when no image exists,
 * so the magazine still looks intentional before editors add photos.
 */
export function PostImage({
  image,
  alt,
  sizes,
  priority = false,
  className = '',
}: {
  image: ImageRef
  alt?: string
  sizes?: string
  priority?: boolean
  className?: string
}) {
  const media = image && typeof image === 'object' ? image : null

  if (!media?.url) {
    // Name the placeholder from `alt` (the post/issue/video title) so an image-only
    // <Link> wrapping it still has an accessible name — otherwise the anchor is a
    // focusable-no-name violation (WCAG 2.4.4/4.1.2) for any item lacking a photo.
    // The visible wordmark stays decorative (aria-hidden) to avoid a double read.
    return (
      <div
        role="img"
        aria-label={alt || 'لالة فاطمة'}
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-200 to-brand-500 ${className}`}
      >
        <span aria-hidden className="text-3xl font-extrabold text-white/70">لالة فاطمة</span>
      </div>
    )
  }

  return (
    <Image
      src={media.url}
      alt={media.alt || alt || ''}
      fill
      sizes={sizes || '(max-width: 768px) 100vw, 33vw'}
      priority={priority}
      className={`object-cover ${className}`}
    />
  )
}
