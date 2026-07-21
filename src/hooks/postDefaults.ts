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
export const applyPostDefaults: CollectionBeforeChangeHook = ({ data, req, operation }) => {
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

  // A blank excerpt is filled from the opening of the article.
  if (data?.content && (typeof data.excerpt !== 'string' || data.excerpt.trim().length === 0)) {
    const derived = deriveExcerpt(data.content as LexicalRoot)
    if (derived) data.excerpt = derived
  }

  return data
}
