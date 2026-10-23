/**
 * Cutting a Lexical document between its top-level blocks, so the article page can place
 * an ad inside the body. Pure and Payload-free, like `lexical-text.ts`.
 *
 * Cuts only ever fall BETWEEN root children: a list, quote, table or block is never split,
 * so every part is a well-formed document that renders exactly as that run of blocks would
 * have in the whole.
 */
import { lexicalToPlainText, type LexicalNode, type LexicalRoot } from './lexical-text'

const isTextParagraph = (node: LexicalNode): boolean =>
  node.type === 'paragraph' && lexicalToPlainText({ root: node }) !== ''

/**
 * The root-child index just after the `n`-th paragraph that has text, or null when the
 * body has fewer, or when that paragraph is the last block (an ad there would sit after
 * the article, not inside it). Empty paragraphs — spacing a journalist pressed Enter for —
 * are not counted.
 */
export function cutAfterParagraph(data: LexicalRoot, n: number): number | null {
  const children = data?.root?.children ?? []
  let seen = 0
  for (let i = 0; i < children.length; i++) {
    if (!isTextParagraph(children[i])) continue
    seen++
    if (seen === n) return i + 1 < children.length ? i + 1 : null
  }
  return null
}

/**
 * Splits the document at the given root-child indices (ascending, each strictly inside
 * the body) into consecutive documents. With no cuts it returns the document unchanged,
 * as the single part.
 */
export function splitAtCuts(data: LexicalRoot, cuts: readonly number[]): LexicalRoot[] {
  const root = data?.root
  if (!root || cuts.length === 0) return [data]
  const children = root.children ?? []
  const bounds = [0, ...cuts, children.length]
  const parts: LexicalRoot[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    parts.push({ ...data, root: { ...root, children: children.slice(bounds[i], bounds[i + 1]) } })
  }
  return parts
}
