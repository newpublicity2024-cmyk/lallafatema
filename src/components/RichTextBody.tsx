import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

import type { VideoEmbedBlock } from '@/payload-types'
import { MediaEmbed } from './embeds/MediaEmbed'
import { Gallery } from './gallery/Gallery'
import type { GalleryImage, GalleryLayout } from './gallery/types'

/**
 * The `gallery` block's stored fields, read defensively.
 *
 * NOT imported from `payload-types.ts` on purpose. These are the shapes that are ALREADY IN
 * THE DATABASE, and a generated type describes the schema as it is today — it cannot promise
 * anything about a row written by an earlier version of the block. Every field is therefore
 * optional here and validated below, which is also what lets this renderer survive a
 * document written before `layout` existed.
 */
type StoredGalleryBlock = {
  blockType?: string
  layout?: string | null
  images?:
    | {
        image?: GalleryImage['image']
        caption?: string | null
        alt?: string | null
      }[]
    | null
}

const GALLERY_LAYOUTS: readonly GalleryLayout[] = ['mosaic', 'grid', 'carousel']

/**
 * Narrow a stored layout string to one the renderer implements.
 *
 * Falls back to `mosaic` (the block's own default) rather than throwing or rendering
 * nothing: a layout value this build does not recognise — a row written by a newer deploy
 * during a rollout, or an older one from before the enum settled — is a reason to pick a
 * sensible layout, never a reason to drop the photos out of the article.
 */
function galleryLayout(value: unknown): GalleryLayout {
  return GALLERY_LAYOUTS.includes(value as GalleryLayout) ? (value as GalleryLayout) : 'mosaic'
}

/** Every row the block holds, in order, with the per-photo overrides preserved. */
function galleryImages(fields: StoredGalleryBlock): GalleryImage[] {
  const rows = Array.isArray(fields.images) ? fields.images : []
  return rows.map((row) => ({
    image: row?.image,
    caption: row?.caption ?? null,
    alt: row?.alt ?? null,
  }))
}

/**
 * Converters for our own Lexical blocks, layered over Payload's defaults.
 *
 * WHAT LEGACY ACTUALLY LOOKS LIKE (measured across all 1,574 live posts): ZERO contain a
 * block node, and 652 contain inline `upload` nodes. So the compatibility surface that
 * matters here is not the blocks at all — it is paragraphs, headings, lists, links and
 * uploads, every one of which is served by `defaultConverters` and must keep being served by
 * it. That is why this spreads the defaults instead of enumerating node types: the moment
 * this file starts listing which legacy nodes it supports, it becomes a list that can be
 * incomplete, and 652 articles are downstream of it.
 */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,

  /**
   * Any node type — or block type — this build has no converter for renders as nothing.
   *
   * Without this, Payload's JSX converter falls back to emitting a literal
   * `<span>unknown node</span>` into the article (and logs for each one). On a live
   * magazine that is a visible defect shown to readers, and it is reachable simply by
   * deploying a new block type and having an editor use it before the frontend ships —
   * exactly the window in which a rollout is half-done. Rendering nothing degrades
   * gracefully instead: the rest of the article is unaffected.
   */
  unknown: () => null,

  blocks: {
    ...defaultConverters.blocks,

    /**
     * `videoEmbed` — the pre-existing slug, with its pre-existing `{url, caption}` fields.
     * Unchanged on purpose (PLAN C3): drafts and version rows may still hold it, so this
     * must keep rendering whatever was stored, including an empty url.
     */
    videoEmbed: ({ node }: { node: { fields: VideoEmbedBlock } }) => (
      <MediaEmbed url={node.fields?.url ?? ''} caption={node.fields?.caption ?? null} />
    ),

    /** `gallery` — multi-photo block with three layouts and a lightbox. */
    gallery: ({ node }: { node: { fields: StoredGalleryBlock } }) => {
      const fields = node.fields ?? {}
      const images = galleryImages(fields)
      if (images.length === 0) return null
      return <Gallery layout={galleryLayout(fields.layout)} images={images} />
    },
  },
})

/**
 * The article/page body renderer. Wraps Payload's `RichText` with the converters for our own
 * Lexical blocks, so a writer can drop a photo gallery or a video between two paragraphs and
 * it renders with the same click-to-load facade, lightbox and RTL behaviour as the rest of
 * the page.
 */
export function RichTextBody({ data, className }: { data: unknown; className?: string }) {
  return <RichText data={data as never} className={className} converters={converters} />
}
