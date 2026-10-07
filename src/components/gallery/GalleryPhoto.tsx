import Image from 'next/image'

import type { Media } from '@/payload-types'
import { PostImage } from '../PostImage'
import type { GalleryImage } from './types'

/**
 * Resolve the alt text for one gallery photo.
 *
 * Priority is block-level override → Media library default → empty string. That order is
 * the opposite of `PostImage`'s (which prefers `media.alt`) and the difference is the whole
 * reason this module exists: `PostImage` renders ONE image chosen by an editor for a
 * specific slot, so the library's own description is the better default there. A gallery
 * photo is reused across articles, and the per-photo `alt` an editor typed inside THIS
 * article is the only text that knows what the photo means HERE. Dropping it (as routing
 * galleries through `PostImage` would) silently discards accessibility work the editor
 * actually did.
 *
 * An empty string is a legitimate result, not a bug: an `alt=""` image is announced as
 * decorative, which is the correct outcome for a photo nobody has described. Inventing a
 * placeholder like "صورة" would be worse — screen-reader users would hear a meaningless
 * word on every tile instead of skipping past it.
 */
export function photoAlt(item: GalleryImage): string {
  const override = typeof item.alt === 'string' ? item.alt.trim() : ''
  if (override) return override
  const media = asMedia(item.image)
  const libraryAlt = typeof media?.alt === 'string' ? media.alt.trim() : ''
  return libraryAlt
}

/** The populated Media doc, or null when the relation came back as a bare id. */
export function asMedia(image: GalleryImage['image']): Media | null {
  return image && typeof image === 'object' ? image : null
}

/**
 * One gallery photo, sized by its parent box.
 *
 * `fill` (not intrinsic width/height) because every caller reserves the aspect ratio on the
 * wrapper — a mosaic tile's height comes from the grid row, not from the photo — so `fill`
 * is what keeps CLS at zero while letting one component serve a square grid cell, a 2x2
 * mosaic hero and a full-viewport lightbox frame.
 *
 * When the relation is unpopulated (or the file has no URL yet) we fall back to `PostImage`,
 * whose branded gradient placeholder is already the site's answer to "an editor has not
 * attached the photo yet". Rendering nothing instead would collapse the grid and make a
 * 7-photo mosaic silently render as 3 tiles, which is far harder for an editor to diagnose
 * than a visible placeholder.
 */
export function GalleryPhoto({
  item,
  sizes,
  priority = false,
  fit = 'cover',
}: {
  item: GalleryImage
  sizes: string
  priority?: boolean
  /** `cover` crops to the tile (grid geometry); `contain` letterboxes (lightbox). */
  fit?: 'cover' | 'contain'
}) {
  const media = asMedia(item.image)
  const alt = photoAlt(item)

  if (!media?.url) {
    return <PostImage image={media} alt={alt} sizes={sizes} priority={priority} />
  }

  return (
    <Image
      src={media.url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={fit === 'contain' ? 'object-contain' : 'object-cover'}
    />
  )
}
