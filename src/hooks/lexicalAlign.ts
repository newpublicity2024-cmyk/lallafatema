import type { FieldHook } from 'payload'

import { stripUnsettableAlignment } from '../lib/lexical-align'
import type { LexicalRoot } from '../lib/lexical-text'

/**
 * Drops the paragraph alignment a Word paste leaves behind, on the way into the database.
 *
 * Only the alignments the toolbar CANNOT set — CSS's logical `start`/`end`. Everything a
 * journalist can actually click (`left`/`center`/`right`/`justify`) is an editorial
 * decision and is written through untouched. `src/lib/lexical-align.ts` carries the full
 * reasoning behind that split, and why `start` in particular is the value that put a
 * pasted article on the far left of the page.
 *
 * WHY A FIELD HOOK and not a collection `beforeChange`: it has to sit on the one field that
 * can hold the residue, in both collections that hold such a field, and it has to run for
 * every write — an editor's save, the 375ms autosave that feeds live preview, a version
 * restore, the article importer, a bare Local API call. A field hook is the narrowest place
 * that covers all of them, and it needs no knowledge of the rest of the document.
 *
 * WHY IT IS NOT LOAD-BEARING FOR CORRECTNESS: this only cleans documents as they are
 * written, and it does not need to do more. Posts already holding `start`/`end` render
 * correctly regardless, because `RichTextBody` emits the stored keyword verbatim as CSS
 * and the browser resolves it against the text direction — `start` is the right-hand side
 * of an Arabic column, exactly as the editor shows it. So this is tidying, not a repair:
 * it keeps stored documents in the shape the editor itself would have produced.
 */
export const stripPastedAlignment: FieldHook = ({ value }) => {
  // A richText field is nullable in both collections; `stripUnsettableAlignment` passes
  // empty values straight through, and returning `value` untouched is what keeps a no-op
  // save a genuine no-op rather than a write of a freshly-allocated identical object.
  return stripUnsettableAlignment(value as LexicalRoot)
}
