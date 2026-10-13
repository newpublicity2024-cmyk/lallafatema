import type { FieldHook } from 'payload'

import { stripSideAlignment } from '../lib/lexical-align'
import type { LexicalRoot } from '../lib/lexical-text'

/**
 * Drops the paragraph alignment a Word paste leaves behind, on the way into the database.
 *
 * `src/lib/lexical-align.ts` carries the full mechanism; the short version is that Word's
 * clipboard HTML brings its own `text-align`, Lexical stores it, and Payload's renderer
 * resolves it with left-to-right physics — which lands the whole article on the far left of
 * an RTL page. Since the editor exposes no alignment control, the value is always residue.
 *
 * WHY A FIELD HOOK and not a collection `beforeChange`: it has to sit on the one field that
 * can hold the residue, in both collections that hold such a field, and it has to run for
 * every write — an editor's save, the 375ms autosave that feeds live preview, a version
 * restore, the article importer, a bare Local API call. A field hook is the narrowest place
 * that covers all of them, and it needs no knowledge of the rest of the document.
 *
 * WHY IT IS NOT THE WHOLE FIX: this only cleans documents as they are written. The posts
 * already carrying the residue are fixed on the read side instead, by `RichTextBody` —
 * see the note there. Both call the same function so the two paths cannot drift.
 */
export const stripPastedAlignment: FieldHook = ({ value }) => {
  // A richText field is nullable in both collections; `stripSideAlignment` passes empty
  // values straight through, and returning `value` untouched is what keeps a no-op save
  // a genuine no-op rather than a write of a freshly-allocated identical object.
  return stripSideAlignment(value as LexicalRoot)
}
