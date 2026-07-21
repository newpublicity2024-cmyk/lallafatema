import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { deriveExcerpt, type LexicalRoot } from '../lib/lexical-text'

/**
 * The header media kind is derived, never chosen: a video URL means a video
 * header, its absence means an image header. Keeping it derived removes a
 * sidebar control and makes the two fields impossible to contradict.
 */
export const deriveFeaturedType = (videoUrl: unknown): 'image' | 'video' =>
  typeof videoUrl === 'string' && videoUrl.trim().length > 0 ? 'video' : 'image'

/**
 * Everything the editorial team should not have to think about.
 *
 * Publish permission and the first-publish timestamp were already here; the
 * featuredType and excerpt derivations are what let those two fields disappear
 * from a journalist's screen.
 */
export const applyPostDefaults: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // Journalists may not publish — only admins/editors can.
  if (
    data?._status === 'published' &&
    req.user &&
    req.user.role !== 'admin' &&
    req.user.role !== 'editor'
  ) {
    throw new APIError('غير مسموح لك بنشر المقالات. يرجى تركها كمسودة لمراجعة المحرّر.', 403)
  }

  // Stamp the first publish date.
  if (data?._status === 'published' && !data.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }

  // Default authorship to the creating user.
  if (operation === 'create' && req.user && (!data.authors || data.authors.length === 0)) {
    data.authors = [req.user.id]
  }

  // Header media kind follows the video URL.
  data.featuredType = deriveFeaturedType(data?.featuredVideoUrl)

  // The excerpt is filled from the opening of the article — and kept in step
  // with it while the writer types.
  //
  // Autosave runs every ~375ms, so "fill only when blank" would freeze the
  // excerpt at whatever the first keystroke produced. To tell an excerpt we
  // generated from one a human wrote, without adding a column to track it, we
  // re-derive from the PREVIOUS body: if the stored excerpt is exactly what the
  // old content would have produced, it is ours to refresh. Anything else was
  // typed by a person and is never touched.
  if (data?.content) {
    const current = data.excerpt
    const isBlank = typeof current !== 'string' || current.trim().length === 0
    const previousContent = (originalDoc as { content?: unknown } | undefined)?.content
    const isOurs =
      !isBlank && Boolean(previousContent) && current === deriveExcerpt(previousContent as LexicalRoot)

    if (isBlank || isOurs) {
      const derived = deriveExcerpt(data.content as LexicalRoot)
      if (derived) data.excerpt = derived
    }
  }

  return data
}
