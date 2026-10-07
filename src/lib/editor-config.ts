import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
  createServerFeature,
} from '@payloadcms/richtext-lexical'

import { GalleryBlock } from '../blocks/Gallery'
import { VideoEmbedBlock } from '../blocks/VideoEmbed'

/**
 * The article editor's Lexical feature list, in one importable place.
 *
 * WHY it is a module and not an inline array in `payload.config.ts`: the editor is the
 * single surface the whole newsroom works in, and "which tools does a journalist actually
 * have?" is a question the audit gates answer by importing this function and reading each
 * feature's key. An inline array in the config can only be inspected by booting Payload,
 * which needs a database — so the one thing most worth checking would be the one thing
 * never checked.
 *
 * Feature choices that are deliberate rather than default:
 *
 * - `UploadFeature` is NOT optional. 652 of the 1,574 live posts contain inline `upload`
 *   nodes; disabling the feature does not migrate them, it makes them unrenderable in the
 *   editor. This is the single most expensive mistake available in this file.
 * - Headings start at `h2`. The article's `<h1>` is its title, rendered by the page, so
 *   offering `h1` in the body would let a writer put two `<h1>`s on one page — an
 *   accessibility and SEO regression that no validation would catch.
 * - `UnderlineFeature` stays even though the request does not name it: it was already
 *   enabled, and removing a format that stored content may use is not a no-op.
 * - Both toolbars are on. The fixed one is what the request asks for ("the toolbar is
 *   always visible"); the inline one is what makes selecting a word and hitting bold feel
 *   normal, and is also the only toolbar on narrow screens where the fixed bar wraps.
 * - Undo/redo are not in this list because they are not features: Lexical's core history
 *   plugin ships them (Ctrl+Z / Ctrl+Shift+Z) and Payload always registers it.
 */
export function articleFeatures() {
  return [
    ParagraphFeature(),
    // Three levels, h1 deliberately withheld — see the note above.
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    StrikethroughFeature(),
    // Ctrl+K / ⌘K, plus the floating link editor for changing an existing link.
    LinkFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    // Payload still ships tables as experimental; the feature key is literally
    // `experimental_table`. The request names tables explicitly, and the alternative —
    // journalists pasting a screenshot of a table — is strictly worse for readers.
    EXPERIMENTAL_TableFeature(),
    UploadFeature(),
    BlocksFeature({ blocks: [GalleryBlock, VideoEmbedBlock] }),
    SmartPasteFeature(),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ]
}

type SmartPasteClientProps = {
  galleryBlockSlug: string
  videoBlockSlug: string
}

/**
 * Registers the paste/drop shortcuts that build the two blocks above.
 *
 * All of the behaviour is client-side (it reacts to a `DataTransfer`), so the server half
 * of the feature exists only to put the plugin into the editor and hand it the block slugs
 * it must create. Passing the slugs as client props rather than hard-coding them in the
 * plugin means a rename cannot silently produce blocks the editor does not know — the
 * value comes from the same block config the `blocks` feature registers.
 *
 * The declared dependencies are a tripwire, not a load order: Payload throws at config
 * sanitisation if `blocks` or `upload` is missing, so removing either feature fails loudly
 * at boot instead of leaving a paste handler that silently inserts unrenderable nodes.
 */
export const SmartPasteFeature = createServerFeature<undefined, undefined, SmartPasteClientProps>({
  dependencies: ['blocks', 'upload'],
  feature: {
    ClientFeature: '/components/admin/editor/SmartPasteFeature#SmartPasteFeatureClient',
    clientFeatureProps: {
      galleryBlockSlug: GalleryBlock.slug,
      videoBlockSlug: VideoEmbedBlock.slug,
    },
  },
  key: 'lfSmartPaste',
})
