/**
 * Plain-text extraction from a Lexical document.
 *
 * Used server-side to derive a post's excerpt and client-side by the publish
 * checklist to tell an empty article from a written one. Deliberately free of
 * Payload imports so it stays isomorphic and unit-testable without a database.
 */

export type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

export type LexicalRoot = { root?: LexicalNode } | null | undefined

/** Excerpt length cap. Matches the ~160 chars a meta description can show. */
export const EXCERPT_MAX_LENGTH = 160

/**
 * Flattens a Lexical document to plain text. Text nodes contribute their content;
 * every node with children contributes a separating space after them, so block
 * boundaries do not glue words together. Nodes that carry no text at all —
 * uploads, horizontal rules, video blocks — contribute nothing.
 */
export function lexicalToPlainText(data: LexicalRoot): string {
  const root = data?.root
  if (!root) return ''

  const parts: string[] = []

  const walk = (node: LexicalNode): void => {
    if (typeof node.text === 'string') parts.push(node.text)
    if (node.type === 'linebreak') parts.push(' ')
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
      // Block separator — the trailing collapse below removes any excess.
      if (node.type !== 'root') parts.push(' ')
    }
  }

  walk(root)

  return parts.join('').replace(/\s+/gu, ' ').trim()
}

/**
 * First `maxLength` characters of the body, cut at a word boundary, with a
 * trailing ellipsis. Trailing punctuation is stripped so the result never reads
 * as "…،…".
 */
export function deriveExcerpt(data: LexicalRoot, maxLength = EXCERPT_MAX_LENGTH): string {
  const text = lexicalToPlainText(data)
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)

  // When the character just past the cut is a space, the clip already ends on a
  // whole word — dropping back to the previous space would lose a complete one.
  const lastSpace = clipped.lastIndexOf(' ')
  const base =
    text[maxLength] === ' ' || lastSpace <= 0 ? clipped : clipped.slice(0, lastSpace)

  return `${base.replace(/[\s،,.:;-]+$/u, '')}…`
}
