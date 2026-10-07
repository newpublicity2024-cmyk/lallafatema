'use client'

import type { PluginComponent } from '@payloadcms/richtext-lexical'
import type { LexicalNode } from '@payloadcms/richtext-lexical/lexical'

import { $createBlockNode, $createUploadNode, createClientFeature } from '@payloadcms/richtext-lexical/client'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  DROP_COMMAND,
  PASTE_COMMAND,
} from '@payloadcms/richtext-lexical/lexical'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { mergeRegister } from '@payloadcms/richtext-lexical/lexical/utils'
import { toast, useConfig } from '@payloadcms/ui'
import { useEffect } from 'react'

import { isEmbeddable } from '../../../lib/embeds'
import { pickImageFiles, uploadImageFiles, type UploadedMedia } from './mediaUpload'

/**
 * "Smart paste": the two shortcuts a newsroom actually uses.
 *
 *   • several photos pasted or dropped into the body  →  ONE gallery block
 *   • a supported video/social link pasted on an empty line  →  the videoEmbed block
 *
 * WHY this is a Lexical feature and not, say, a button: the journalists this admin was
 * built for arrive with a folder of photos and a link in the clipboard. Every extra step
 * between "I have the photos" and "the photos are in the article" is a step where eight
 * photos become eight separate single-image uploads scattered through the text, which is
 * what the live corpus looks like today (652 posts carry loose inline `upload` nodes and
 * not one carries a block). The paste IS the interaction; the toolbar is the fallback.
 *
 * WHY the handlers sit at CRITICAL priority: Lexical's own rich-text paste handler is
 * registered at editor priority and will happily insert the pasted URL as text (or let the
 * link feature autolink it) before we get a look. Running first lets us claim the event,
 * `preventDefault()` it, and leave everything we do NOT claim completely untouched — a
 * paste of ordinary text, of one image, of a link into the middle of a sentence, all still
 * behave exactly as they did before this feature existed.
 */

type SmartPasteProps = {
  galleryBlockSlug: string
  videoBlockSlug: string
}

/**
 * Payload generates array-row and block IDs as 24-character BSON ObjectId hex strings.
 * Rows we build by hand have to carry an ID too (the block's form state is keyed by it),
 * and matching the existing shape means nothing downstream has to special-case ours.
 * `bson-objectid` is a Payload-internal dependency, so the shape is reproduced here from
 * `crypto` rather than imported across a package boundary we do not own.
 */
function rowId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Where a pasted block goes.
 *
 * Replacing the current paragraph when it is empty is what makes "paste on a blank line"
 * feel like the block was typed there. Otherwise the block is inserted AFTER the whole
 * paragraph rather than splitting it mid-sentence: a photo wedged between two halves of a
 * sentence is never what the journalist meant, and an un-split paragraph is trivially
 * undoable while a split one is not.
 *
 * Must be called inside an editor update — every caller is a command listener, which
 * Lexical already runs inside one.
 */
function $placeBlock(node: LexicalNode): void {
  const selection = $getSelection()

  if ($isRangeSelection(selection)) {
    const top = selection.anchor.getNode().getTopLevelElement()
    if (top) {
      if ($isParagraphNode(top) && top.getTextContent().trim() === '') {
        top.replace(node)
      } else {
        top.insertAfter(node)
      }
      // A decorator block as the last child leaves the caret with nowhere to go, so the
      // journalist cannot type after their own gallery. Always leave a paragraph behind it.
      if (node.getNextSibling() === null) {
        node.insertAfter($createParagraphNode())
      }
      return
    }
  }

  const root = $getRoot()
  root.append(node)
  if (node.getNextSibling() === null) {
    node.insertAfter($createParagraphNode())
  }
}

const SmartPastePlugin: PluginComponent<SmartPasteProps> = ({ clientProps }) => {
  const { galleryBlockSlug, videoBlockSlug } = clientProps
  const [editor] = useLexicalComposerContext()
  const { config } = useConfig()

  // `serverURL` is '' in the common same-origin setup, which leaves a relative '/api'.
  const apiBase = `${config.serverURL ?? ''}${config.routes.api}`

  useEffect(() => {
    /**
     * Inserts a visible placeholder paragraph, uploads in the background, then swaps the
     * placeholder for the finished block.
     *
     * The placeholder is the whole point of doing it this way rather than awaiting the
     * uploads first: a command listener cannot be async, and a journalist who pastes six
     * photos and sees *nothing* for four seconds pastes them again. Anchoring on the
     * placeholder's node key also means the block lands where the paste happened even if
     * the caret has moved on while the files were uploading.
     */
    const runUpload = (files: File[], asGallery: boolean): void => {
      const placeholder = $createParagraphNode()
      placeholder.append(
        $createTextNode(
          files.length > 1 ? `⏳ جارٍ رفع ${files.length} صور…` : '⏳ جارٍ رفع الصورة…',
        ),
      )
      $placeBlock(placeholder)
      const placeholderKey = placeholder.getKey()

      const finish = (build: (() => LexicalNode) | null, errors: string[]): void => {
        const messages = [...errors]

        editor.update(() => {
          const anchor = $getNodeByKey(placeholderKey)
          if (!build) {
            anchor?.remove()
            return
          }
          if (!anchor) {
            // The journalist deleted the placeholder (or undid the paste) while the
            // upload was in flight. Appending at the end would drop photos into a random
            // place in someone's article, so the right move is to keep the uploaded
            // media — they are in the library — and insert nothing.
            messages.push(
              'انتهى رفع الصور بعد حذف موضعها، فلم تُضَف إلى المقال. ستجدها في مكتبة الوسائط.',
            )
            return
          }
          const node = build()
          anchor.replace(node)
          if (node.getNextSibling() === null) {
            node.insertAfter($createParagraphNode())
          }
        })

        for (const message of messages) toast.error(message)
      }

      void (async () => {
        const { created, errors } = await uploadImageFiles(files, apiBase)
        const first = created[0]

        if (!first) {
          finish(null, errors.length > 0 ? errors : ['تعذّر رفع الصور.'])
          return
        }

        // One photo that survived out of a multi-photo paste is a single image, not a
        // gallery of one — inserting it as an upload node keeps the article honest.
        const asSingleImage = !asGallery || created.length === 1
        finish(
          () =>
            asSingleImage
              ? $createUploadNode({
                  data: { fields: {}, relationTo: 'media', value: first.id },
                })
              : $createBlockNode({
                  blockName: '',
                  blockType: galleryBlockSlug,
                  images: created.map((media: UploadedMedia) => ({
                    alt: '',
                    caption: '',
                    id: rowId(),
                    image: media.id,
                  })),
                  layout: 'mosaic',
                }),
          errors,
        )
      })()
    }

    /** Shared by paste and drop: both carry files and text in a `DataTransfer`. */
    const handleTransfer = (dataTransfer: DataTransfer | null, event: Event | null): boolean => {
      if (!dataTransfer) return false

      const images = pickImageFiles(dataTransfer)
      if (images.length > 0) {
        event?.preventDefault()
        // `images.length === 1` still goes through the upload path (as an upload node, see
        // `finish`) because dropping one photo and getting nothing at all is the worse
        // surprise; only the *gallery* needs several.
        runUpload(images, images.length > 1)
        return true
      }

      // Not files — maybe a link. `getData` on a drop event is only readable during the
      // event, which is why this runs synchronously inside the listener.
      const text = dataTransfer.getData('text/plain')?.trim() ?? ''
      if (text === '' || !isEmbeddable(text)) return false

      const selection = $getSelection()
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
      const top = selection.anchor.getNode().getTopLevelElement()
      // Only an EMPTY line auto-embeds. Pasting a YouTube link into the middle of a
      // sentence means the journalist wants a link, and the link feature should get it.
      if (!top || !$isParagraphNode(top) || top.getTextContent().trim() !== '') return false

      event?.preventDefault()
      const block = $createBlockNode({
        blockName: '',
        blockType: videoBlockSlug,
        caption: '',
        url: text,
      })
      $placeBlock(block)
      return true
    }

    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) =>
          handleTransfer(
            (event as ClipboardEvent).clipboardData,
            event as ClipboardEvent | null,
          ),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) =>
          handleTransfer((event as DragEvent).dataTransfer, event as DragEvent | null),
        COMMAND_PRIORITY_CRITICAL,
      ),
    )
  }, [apiBase, editor, galleryBlockSlug, videoBlockSlug])

  return null
}

export const SmartPasteFeatureClient = createClientFeature<SmartPasteProps>({
  plugins: [{ Component: SmartPastePlugin, position: 'normal' }],
})
