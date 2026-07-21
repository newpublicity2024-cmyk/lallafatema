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
 * Reads a field the way a derivation must: `data` is the INCOMING PATCH, not the
 * merged document (Payload passes it straight through — see
 * `collections/operations/utilities/update.js`). A partial write that omits a
 * key must fall back to the stored value, or the derivation below would compute
 * from `undefined` and overwrite good data.
 */
const readField = <T,>(
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown> | undefined,
  key: string,
): T | undefined => (key in data ? data[key] : originalDoc?.[key]) as T | undefined

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

  const original = originalDoc as Record<string, unknown> | undefined

  // Header media kind follows the video URL. Read through to the stored value so
  // a partial update that omits featuredVideoUrl does not silently demote a
  // video post to 'image' — that flag drives /videos, the card badge, the
  // article header and the VideoObject JSON-LD.
  data.featuredType = deriveFeaturedType(readField(data, original, 'featuredVideoUrl'))

  // The excerpt is filled from the opening of the article — and kept in step
  // with it while the writer types.
  //
  // Autosave runs every ~375ms, so "fill only when blank" would freeze the
  // excerpt at whatever the first keystroke produced. To tell an excerpt we
  // generated from one a human wrote, without adding a column to track it, we
  // re-derive from the PREVIOUS body: if the stored excerpt is exactly what the
  // old content would have produced, it is ours to refresh. Anything else was
  // typed by a person and is never touched.
  //
  // Two accepted limitations of doing this without a tracking column:
  //   1. If the client's excerpt ever falls a generation behind originalDoc's
  //      content (a dropped or late autosave response), `isOurs` latches false
  //      and the excerpt freezes at that draft's text. It stays valid, just
  //      stale — the writer can always overwrite it by hand.
  //   2. A writer who types an excerpt identical to what we would have derived
  //      (e.g. copying their own first sentence) will see it re-derived later.
  if (data?.content) {
    const current = readField<string>(data, original, 'excerpt')
    const isBlank = typeof current !== 'string' || current.trim().length === 0
    const previousContent = original?.content
    const isOurs =
      !isBlank &&
      Boolean(previousContent) &&
      current === deriveExcerpt(previousContent as LexicalRoot)

    if (isBlank || isOurs) {
      const derived = deriveExcerpt(data.content as LexicalRoot)
      if (derived) data.excerpt = derived
    }
  }

  return data
}
