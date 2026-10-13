/**
 * Paragraph alignment inherited from a paste, and why this site drops it.
 *
 * THE BUG THIS EXISTS FOR. A journalist writes in Word, copies, pastes into the article
 * editor. Word's clipboard HTML carries the paragraph's alignment (`text-align:right` for
 * an RTL paragraph, `align=left` on an older/LTR one, `text-align:justify`, …), and
 * Lexical's paragraph importer faithfully records it: `$convertParagraphElement` calls
 * `node.setFormat(element.style.textAlign)`. So the stored document now holds an
 * alignment nobody chose — and, crucially, one the journalist cannot see or clear,
 * because `articleFeatures()` ships NO align feature. There is no button to un-press.
 *
 * It then renders differently in the two places she looks:
 *
 *   - In the EDITOR, Lexical writes the keyword straight into the DOM
 *     (`setElementFormat` → `style.text-align: start`). CSS resolves `start`/`end`
 *     against the paragraph's own direction, so on Arabic text `start` means RIGHT and
 *     the editor looks perfectly normal.
 *   - On the PAGE, Payload's Lexical→JSX converter resolves the same keyword with
 *     hard-coded left-to-right physics: `start` becomes `text-align: left`, `end` becomes
 *     `right`, and a plain `left` is dropped altogether
 *     (`lexicalToJSX/converter/index.js`). An inline `text-align: left` beats the
 *     document's `dir="rtl"`, so the whole body slams to the far left.
 *
 * Same stored byte, opposite sides. That is the "it looks fine in the editor but not in
 * preview" report, and it is why the fix cannot live in CSS: an inline style wins.
 *
 * THE RULE. Side alignment — `start`, `end`, `left`, `right` — is residue. This editor
 * cannot express it, so a stored value is never an editorial decision, and an Arabic
 * article's paragraphs should simply follow the page's direction like every other
 * paragraph does. We drop it in both directions: on save, so a paste stops storing it,
 * and on render, so the ~1.5k posts already carrying it come out right with no migration.
 *
 * `center` and `justify` are NOT side alignment. They are direction-neutral (they mean
 * the same thing in Arabic as in French), Payload renders them correctly, and legacy
 * content may use them deliberately — so they survive untouched. Dropping them would be
 * a silent content change on posts nobody asked us to edit.
 */

import type { LexicalNode, LexicalRoot } from './lexical-text'

/**
 * The alignments that name a side of the column.
 *
 * `left`/`right` are physical; `start`/`end` are logical and resolve against the text
 * direction. All four are dropped, because all four are answers to a question the page
 * direction has already answered.
 */
export const SIDE_ALIGNMENTS = ['left', 'right', 'start', 'end'] as const

const SIDE_ALIGNMENT_SET: ReadonlySet<string> = new Set(SIDE_ALIGNMENTS)

/**
 * Is this node's `format` a side alignment?
 *
 * The `typeof === 'string'` guard is the whole subtlety of this file. Lexical overloads
 * `format`: on an ELEMENT node (paragraph, heading, quote, list, upload, block) it is an
 * alignment keyword, but on a TEXT node it is a NUMERIC bitmask of bold/italic/underline/…
 * — `IS_BOLD` is `1`. Treating a number as a keyword here would be harmless, but treating
 * the field generically while REWRITING it is not: clearing the format of a text node
 * would strip the bold off every word in the article. Only strings are ever touched.
 */
function isSideAlignment(format: unknown): format is string {
  return typeof format === 'string' && SIDE_ALIGNMENT_SET.has(format)
}

/**
 * Returns the node with side alignment removed, anywhere in its subtree.
 *
 * Returns the IDENTICAL object when there is nothing to change. That is not a
 * micro-optimisation for its own sake: this runs on every article render, on documents
 * with hundreds of nodes, and the overwhelmingly common case is a document with no stray
 * alignment at all. Returning the same reference keeps that case allocation-free and lets
 * React's reconciler see unchanged children.
 */
function stripNode(node: LexicalNode): LexicalNode {
  const children = Array.isArray(node.children) ? node.children : null

  let nextChildren: LexicalNode[] | null = null
  if (children) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      // A malformed child (null, a string, a number) is left exactly as found: this is a
      // normaliser, not a validator, and the renderer downstream already tolerates junk.
      const next = child && typeof child === 'object' ? stripNode(child) : child
      if (next !== child && !nextChildren) nextChildren = children.slice(0, i)
      if (nextChildren) nextChildren.push(next)
    }
  }

  const dropFormat = isSideAlignment(node.format)
  if (!dropFormat && !nextChildren) return node

  const copy: LexicalNode = { ...node }
  // Lexical's own serialiser writes `format: ''` for "no alignment" rather than omitting
  // the key, so matching that shape keeps a normalised document byte-comparable with a
  // freshly-typed one instead of introducing a third state the editor has never produced.
  if (dropFormat) copy.format = ''
  if (nextChildren) copy.children = nextChildren
  return copy
}

/**
 * A Lexical document with every side alignment removed.
 *
 * Shape-preserving and total: a `null`/`undefined` field, a document with no `root`, or a
 * `root` that is not an object all pass straight through. A richText field is nullable in
 * both collections that use it, and a normaliser that throws on an empty body would turn
 * "this post has no text yet" into a failed save.
 */
export function stripSideAlignment<T extends LexicalRoot>(data: T): T {
  const root = data?.root
  if (!root || typeof root !== 'object') return data

  const nextRoot = stripNode(root)
  if (nextRoot === root) return data

  return { ...data, root: nextRoot } as T
}
