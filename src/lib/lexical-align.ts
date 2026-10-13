/**
 * Paragraph alignment: what the toolbar can set, what a paste leaves behind, and how the
 * page renders either of them.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * Payload's Lexical→JSX converter resolves alignment with hard-coded left-to-right
 * physics (`lexicalToJSX/converter/index.js`): the direction-neutral `start` becomes
 * `text-align: left`, `end` becomes `right`, and a plain `left` is dropped altogether.
 * On a site whose every page is `dir="rtl"` that is wrong three ways, and an inline
 * `text-align: left` beats the document direction — which is how a Word-pasted article
 * came to render flush against the far left of the page while the editor still showed it
 * correctly right-aligned (#6). The editor looked fine because Lexical writes the keyword
 * VERBATIM into the DOM (`setElementFormat`), and CSS resolves `start` against the
 * paragraph's own direction, which on Arabic means right.
 *
 * So the renderer here does what the editor does — emits the stored keyword as CSS,
 * unchanged — and tells Payload's own text-align pass to stand down. Editor and page then
 * agree by construction rather than by coincidence.
 *
 * ── The split that makes alignment safe to offer ──────────────────────────────────
 *
 * `AlignFeature` dispatches ONLY physical keywords: `left`, `center`, `right`, `justify`
 * (see its client feature — every button is `FORMAT_ELEMENT_COMMAND` with one of those).
 * It cannot produce Lexical's logical `start`/`end`. That gives a reliable test of intent:
 *
 *   - a physical value is something a journalist clicked, so it is honoured and preserved;
 *   - `start`/`end` are unreachable from the toolbar, so they can only have arrived in a
 *     paste — and `start` is the precise value that caused #6. They are stripped on save.
 *
 * This is the whole reason the editor may now offer alignment without reopening that bug.
 * If `AlignFeature` is ever removed from `articleFeatures()`, the premise is void and this
 * file has to be revisited: every physical alignment on the site would become something no
 * one could see or clear.
 */

import type { LexicalNode, LexicalRoot } from './lexical-text'

/** The alignments a journalist can actually set from the editor toolbar. */
export const TOOLBAR_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const

/**
 * The alignments the toolbar cannot produce, and which therefore only ever arrive by
 * paste. `start`/`end` are CSS's *logical* keywords; Word and several web editors emit
 * them, Lexical's importer records them, and Payload then renders `start` as a physical
 * left — the far side of an Arabic column.
 */
export const UNSETTABLE_ALIGNMENTS = ['start', 'end'] as const

const UNSETTABLE: ReadonlySet<string> = new Set(UNSETTABLE_ALIGNMENTS)

/**
 * The CSS `text-align` for a stored alignment, or `undefined` to inherit.
 *
 * The value passes through untouched on purpose. `start`/`end` stay logical so the browser
 * resolves them against the text direction, `left`/`right` stay physical because that is
 * what the journalist asked for, and the result is byte-identical to the declaration
 * Lexical puts on the same node inside the editor. Anything cleverer here would be a
 * second opinion about alignment, and a second opinion is exactly what caused #6.
 */
export function alignmentStyle(format: unknown): string | undefined {
  return typeof format === 'string' && format !== '' ? format : undefined
}

/**
 * Is this node's `format` an alignment the toolbar could not have set?
 *
 * The `typeof === 'string'` guard is the subtlety. Lexical overloads `format`: on an
 * ELEMENT node (paragraph, heading, quote, list, upload, block) it is an alignment
 * keyword, but on a TEXT node it is a NUMERIC bitmask of bold/italic/underline/… —
 * `IS_BOLD` is `1`. Clearing a text node's format would strip the bold off every
 * emphasised word in the article, so only strings are ever touched.
 */
function isUnsettableAlignment(format: unknown): format is string {
  return typeof format === 'string' && UNSETTABLE.has(format)
}

/**
 * Returns the node with toolbar-unsettable alignment removed, anywhere in its subtree.
 *
 * Returns the IDENTICAL object when there is nothing to change, so a document with no
 * residue — the normal case — costs no allocation and a clean save stays a true no-op.
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

  const dropFormat = isUnsettableAlignment(node.format)
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
 * A Lexical document with every toolbar-unsettable alignment removed.
 *
 * Shape-preserving and total: a `null`/`undefined` field, a document with no `root`, or a
 * `root` that is not an object all pass straight through. A richText field is nullable in
 * both collections that use it, and a normaliser that threw on an empty body would turn
 * "this post has no text yet" into a failed save.
 */
export function stripUnsettableAlignment<T extends LexicalRoot>(data: T): T {
  const root = data?.root
  if (!root || typeof root !== 'object') return data

  const nextRoot = stripNode(root)
  if (nextRoot === root) return data

  return { ...data, root: nextRoot } as T
}
