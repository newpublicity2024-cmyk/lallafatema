/**
 * Renders one JSON-LD block. Server component — `data` is a plain object from a
 * builder in `@/lib/seo`. Safe stringify (no user HTML; `<` escaped defensively).
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
