import type { Media } from '@/payload-types'

/**
 * The three layouts the `gallery` Lexical block offers an editor. The STORED values are
 * these English slugs even though the admin labels are Arabic (see PLAN C2): the layout is
 * a rendering contract, and translating a stored enum would break every existing document
 * the day someone changes a label.
 */
export type GalleryLayout = 'mosaic' | 'grid' | 'carousel'

/**
 * One photo as the block stores it.
 *
 * `image` is widened to Payload's actual relationship shape rather than to the populated
 * `Media` doc alone. A gallery read back at `depth: 0` hands us a bare relation id, and an
 * article must not blank out — or worse, lose tiles and so lose its "+N" arithmetic —
 * because someone tuned a loader. `GalleryPhoto.tsx` narrows it once and falls back to the
 * site's branded placeholder for anything unpopulated.
 *
 * `caption` and `alt` are per-photo editorial overrides. They are deliberately separate from
 * the Media doc's own `alt`: the same photo can be reused across articles where it means
 * different things, and the block-level value is the one closest to the context the reader
 * is in, so it WINS over `media.alt` (which is the library-wide default).
 */
export type GalleryImage = {
  image: number | Media | null | undefined
  caption?: string | null
  alt?: string | null
}
