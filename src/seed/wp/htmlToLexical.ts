/**
 * Convert scraped WordPress `content_html` into a Payload Lexical editor state.
 *
 * Scope (v1 migration): paragraphs, headings, ordered/unordered lists, blockquotes,
 * inline bold/italic/links/linebreaks, horizontal rules, and images. Images become
 * Lexical **upload nodes** — the caller pre-uploads each file to the `media`
 * collection and passes a `resolveImage(localPath) -> mediaId` lookup. Unknown/empty
 * wrappers (WP gallery/figure `<div>`s) are flattened by recursing into their children.
 *
 * Pure and dependency-light (node-html-parser only) so it is unit-testable without a DB.
 */
import { type HTMLElement as ParsedElement, type Node as ParsedNode, parse } from 'node-html-parser'

// Lexical text-format bitmask.
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_UNDERLINE = 8

const RTL = 'rtl' as const

type LexicalNode = Record<string, unknown>

// Unique per-node id for nodes that carry sub-fields (upload/link). Deterministic-ish
// counter + random suffix; only needs to be unique within one document.
let nodeCounter = 0
const uid = (): string => `${Date.now().toString(36)}-${(nodeCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const NODE_TYPE = 1 // node-html-parser: ELEMENT_NODE
const TEXT_TYPE = 3 // node-html-parser: TEXT_NODE

const isElement = (n: ParsedNode): n is ParsedElement => n.nodeType === NODE_TYPE
const isText = (n: ParsedNode): boolean => n.nodeType === TEXT_TYPE

const textNode = (text: string, format: number): LexicalNode => ({
  type: 'text',
  version: 1,
  text,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
})

const paragraph = (children: LexicalNode[]): LexicalNode => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: RTL,
  textFormat: 0,
  textStyle: '',
  children,
})

const heading = (tag: string, children: LexicalNode[]): LexicalNode => ({
  type: 'heading',
  version: 1,
  tag,
  format: '',
  indent: 0,
  direction: RTL,
  children,
})

const quote = (children: LexicalNode[]): LexicalNode => ({
  type: 'quote',
  version: 1,
  format: '',
  indent: 0,
  direction: RTL,
  children,
})

const listNode = (ordered: boolean, children: LexicalNode[]): LexicalNode => ({
  type: 'list',
  version: 1,
  tag: ordered ? 'ol' : 'ul',
  listType: ordered ? 'number' : 'bullet',
  start: 1,
  format: '',
  indent: 0,
  direction: RTL,
  children,
})

const listItem = (value: number, children: LexicalNode[]): LexicalNode => ({
  type: 'listitem',
  version: 1,
  value,
  format: '',
  indent: 0,
  direction: RTL,
  children,
})

const linkNode = (url: string, newTab: boolean, children: LexicalNode[]): LexicalNode => ({
  type: 'link',
  version: 3,
  id: uid(),
  fields: { linkType: 'custom', url, newTab },
  format: '',
  indent: 0,
  direction: RTL,
  children,
})

const uploadNode = (mediaId: number | string): LexicalNode => ({
  type: 'upload',
  version: 3,
  id: uid(),
  relationTo: 'media',
  value: mediaId,
  fields: null,
  format: '',
})

const horizontalRule = (): LexicalNode => ({ type: 'horizontalrule', version: 1 })
const lineBreak = (): LexicalNode => ({ type: 'linebreak', version: 1 })

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
// Collapse the WP heading range into the article body's h2–h4 (the page reserves h1).
const normalizeHeadingTag = (tag: string): string => (tag === 'h1' || tag === 'h2' ? 'h2' : tag === 'h3' ? 'h3' : 'h4')

export type ResolveImage = (localPath: string) => number | string | null

/** Collect inline (text-level) children into Lexical inline nodes, tracking format. */
function collectInline(node: ParsedNode, format: number, resolve: ResolveImage, out: LexicalNode[]): void {
  for (const child of node.childNodes) {
    if (isText(child)) {
      const raw = child.rawText
      // Decode entities via node-html-parser's text (rawText keeps entities); use .text on a wrapper.
      const text = decodeEntities(raw)
      if (text.length === 0) continue
      out.push(textNode(text, format))
      continue
    }
    if (!isElement(child)) continue
    const tag = child.rawTagName?.toLowerCase()
    switch (tag) {
      case 'strong':
      case 'b':
        collectInline(child, format | FORMAT_BOLD, resolve, out)
        break
      case 'em':
      case 'i':
        collectInline(child, format | FORMAT_ITALIC, resolve, out)
        break
      case 'u':
        collectInline(child, format | FORMAT_UNDERLINE, resolve, out)
        break
      case 'br':
        out.push(lineBreak())
        break
      case 'a': {
        const href = child.getAttribute('href') || ''
        const inner: LexicalNode[] = []
        collectInline(child, format, resolve, inner)
        if (href && inner.length > 0) {
          const newTab = (child.getAttribute('target') || '') === '_blank'
          out.push(linkNode(href, newTab, inner))
        } else {
          out.push(...inner)
        }
        break
      }
      default:
        // span / font / other inline wrappers → flatten
        collectInline(child, format, resolve, out)
    }
  }
}

const decodeEntities = (s: string): string => {
  // node-html-parser leaves basic entities; decode the common ones + numeric.
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
}

/** Emit upload nodes for every <img> inside an element (handles figures & galleries). */
function collectImages(el: ParsedElement, resolve: ResolveImage, out: LexicalNode[]): void {
  for (const img of el.querySelectorAll('img')) {
    const src = img.getAttribute('src') || ''
    const mediaId = src ? resolve(src) : null
    if (mediaId != null) out.push(uploadNode(mediaId))
  }
}

/** Convert block-level children of `root` into Lexical block nodes. */
function convertBlocks(root: ParsedNode, resolve: ResolveImage): LexicalNode[] {
  const blocks: LexicalNode[] = []

  for (const child of root.childNodes) {
    if (isText(child)) {
      const text = decodeEntities(child.rawText)
      if (text.trim().length === 0) continue
      blocks.push(paragraph([textNode(text, 0)]))
      continue
    }
    if (!isElement(child)) continue
    const tag = child.rawTagName?.toLowerCase() || ''

    if (tag === 'p') {
      const inline: LexicalNode[] = []
      collectInline(child, 0, resolve, inline)
      // A <p> that only wraps an image → emit the image as its own block.
      const imgs = child.querySelectorAll('img')
      if (inline.length === 0 && imgs.length > 0) {
        collectImages(child, resolve, blocks)
      } else if (inline.length > 0) {
        blocks.push(paragraph(inline))
        // If the paragraph also contains images, append them after.
        if (imgs.length > 0) collectImages(child, resolve, blocks)
      }
      continue
    }

    if (HEADING_TAGS.has(tag)) {
      const inline: LexicalNode[] = []
      collectInline(child, 0, resolve, inline)
      if (inline.length > 0) blocks.push(heading(normalizeHeadingTag(tag), inline))
      continue
    }

    if (tag === 'ul' || tag === 'ol') {
      const items: LexicalNode[] = []
      let idx = 1
      for (const li of child.childNodes) {
        if (!isElement(li) || li.rawTagName?.toLowerCase() !== 'li') continue
        const inline: LexicalNode[] = []
        collectInline(li, 0, resolve, inline)
        if (inline.length > 0) items.push(listItem(idx++, inline))
      }
      if (items.length > 0) blocks.push(listNode(tag === 'ol', items))
      continue
    }

    if (tag === 'blockquote') {
      const inline: LexicalNode[] = []
      collectInline(child, 0, resolve, inline)
      if (inline.length > 0) blocks.push(quote(inline))
      continue
    }

    if (tag === 'hr') {
      blocks.push(horizontalRule())
      continue
    }

    if (tag === 'img') {
      const src = child.getAttribute('src') || ''
      const mediaId = src ? resolve(src) : null
      if (mediaId != null) blocks.push(uploadNode(mediaId))
      continue
    }

    if (tag === 'figure' || tag === 'picture') {
      collectImages(child, resolve, blocks)
      // A figcaption becomes a small paragraph beneath the image.
      const cap = child.querySelector('figcaption')
      if (cap) {
        const inline: LexicalNode[] = []
        collectInline(cap, FORMAT_ITALIC, resolve, inline)
        if (inline.length > 0) blocks.push(paragraph(inline))
      }
      continue
    }

    // iframe/video/script/style → skipped (videos are deferred; scripts unsafe).
    if (['iframe', 'video', 'script', 'style', 'noscript'].includes(tag)) continue

    // Unknown wrapper (div/section/article/gallery) → recurse into it.
    const nested = convertBlocks(child, resolve)
    if (nested.length > 0) blocks.push(...nested)
  }

  return blocks
}

export type ConvertResult = {
  state: { root: LexicalNode }
  imageCount: number
}

/**
 * Convert `html` to a Payload Lexical state. `resolve` maps a scraped image `src`
 * (e.g. `images/33518/hero.jpg`) to an uploaded media id; return null to drop it.
 * Falls back to a single paragraph of `fallbackText` if the HTML yields nothing.
 */
export function htmlToLexical(html: string, resolve: ResolveImage, fallbackText = ''): ConvertResult {
  const doc = parse(html || '', { comment: false })
  let blocks = convertBlocks(doc, resolve)

  if (blocks.length === 0 && fallbackText.trim().length > 0) {
    blocks = [paragraph([textNode(decodeEntities(fallbackText), 0)])]
  }
  if (blocks.length === 0) {
    blocks = [paragraph([])]
  }

  const imageCount = blocks.filter((b) => b.type === 'upload').length

  return {
    state: {
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: RTL,
        children: blocks,
      },
    },
    imageCount,
  }
}
