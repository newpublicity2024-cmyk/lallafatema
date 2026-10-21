import { cloneElement, isValidElement, type ReactNode } from 'react'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

import type { VideoEmbedBlock } from '@/payload-types'
import { alignmentStyle } from '@/lib/lexical-align'
import { MediaEmbed } from './embeds/MediaEmbed'
import { VideoFile } from './embeds/VideoFile'
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

/**
 * The `videoFile` block's stored fields, read defensively — same rule as the gallery above.
 *
 * `video` and `poster` are `unknown` rather than `number | Media` on purpose: Payload hands
 * back a populated document at `depth >= 1` and a bare id otherwise, and the renderer is the
 * wrong place to assume which one a given call site asked for.
 */
type StoredVideoFileBlock = {
  blockType?: string
  video?: unknown
  poster?: unknown
  caption?: string | null
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
 * Wraps one converter so the node's own alignment lands on the element it produces.
 *
 * This is deliberately the LAST thing that touches the element, and it mirrors what
 * Lexical's reconciler does inside the editor: emit the stored keyword as `text-align`,
 * unchanged. Payload's equivalent pass is switched off (`disableTextAlign` below) because
 * it rewrites `start` to a physical `left` and drops `left` entirely — see
 * `lexical-align.ts`.
 *
 * An existing `style` on the converter's own output wins, matching the precedence Payload
 * uses for its own injection, so a block that has already decided how it lays itself out
 * is never overridden by a stray alignment.
 */
function withAlignment<Args extends { node?: { format?: unknown } }>(
  convert: (args: Args) => ReactNode,
): (args: Args) => ReactNode {
  return (args) => {
    const element = convert(args)
    const textAlign = alignmentStyle(args.node?.format)
    if (!textAlign || !isValidElement(element)) return element

    const props = element.props as { style?: Record<string, unknown> }
    return cloneElement(element, { style: { textAlign, ...(props.style ?? {}) } } as never)
  }
}

/**
 * Applies `withAlignment` across a converter map, including the nested block maps.
 *
 * EXPORTED for one regression test. The defect it guards is invisible to every renderer a
 * unit test can reach — see `rich-text-body.int.spec.tsx` — so the test asserts this
 * function's contract directly instead.
 *
 * NOT EVERY CONVERTER IS A FUNCTION. Payload ships some as a pre-built React element —
 * `linebreak` is literally `_jsx("br", {})`, a constant created once at module load. A React
 * element is also an `object`, so the `typeof value === 'object'` branch used to recurse into
 * it and rebuild it from `Object.entries`.
 *
 * That rebuild is lossy in a way that is invisible until it is not. It keeps `$$typeof`, so
 * the result still passes `isValidElement` and still renders — but it drops the properties
 * that are not enumerable: `ref`, `_debugInfo`, `_debugStack`, `_debugTask`. A production
 * React build never looks at those, which is why the site has been serving these articles
 * correctly. A DEVELOPMENT build checks them and refuses: "Attempted to render <br key='1'>
 * without development properties", after which Next fails to serialise its own error and the
 * request hangs instead of returning.
 *
 * Measured: 168 of 1,575 published articles contain a `linebreak` node, so ~11% of the
 * archive could not be opened on a dev server, and the hung requests saturated it.
 *
 * `isValidElement` is the guard. An element is passed through untouched — it has no
 * alignment to apply and nothing to recurse into.
 */
export function alignAll(map: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'function') {
      out[key] = withAlignment(value as (args: { node?: { format?: unknown } }) => ReactNode)
    } else if (value && typeof value === 'object' && !isValidElement(value)) {
      // `blocks` / `inlineBlocks` are maps of converters keyed by block type.
      out[key] = alignAll(value as Record<string, unknown>)
    } else {
      out[key] = value
    }
  }
  return out
}

/**
 * What the article body renders with: our own block converters, with alignment applied on
 * top of every one of them.
 */
const converters: JSXConvertersFunction = (args) => alignAll(baseConverters(args)) as never

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
const baseConverters: JSXConvertersFunction = ({ defaultConverters }) => ({
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

    /**
     * `videoFile` — a video the newsroom uploaded, played from our own object storage.
     *
     * The fields are read off the node rather than destructured through the generated
     * `VideoFileBlock` type for the same reason the gallery is: `video` and `poster` arrive
     * as a populated media object at `depth >= 1` (which is what `getPostById` asks for) and
     * as a bare id otherwise, and the renderer has to survive both. It narrows them itself.
     */
    videoFile: ({ node }: { node: { fields?: StoredVideoFileBlock } }) => (
      <VideoFile
        video={node.fields?.video}
        poster={node.fields?.poster}
        caption={node.fields?.caption ?? null}
      />
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
 *
 * WHY `disableTextAlign`: Payload's own text-align pass resolves alignment with hard-coded
 * left-to-right physics, so on this RTL site it renders a stored `start` as a physical
 * `left` and drops `left` altogether — the defect behind #6. Switching it off and applying
 * the keyword ourselves in `withAlignment` makes the page agree with the editor by
 * construction. Indent is NOT disabled: Payload's `paddingInlineStart` handling is already
 * direction-correct and is still wanted.
 */
export function RichTextBody({ data, className }: { data: unknown; className?: string }) {
  return (
    <RichText
      data={data as never}
      className={className}
      converters={converters}
      disableTextAlign
    />
  )
}
