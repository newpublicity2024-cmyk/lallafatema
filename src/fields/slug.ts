import type { Field } from 'payload'

/**
 * Slugify that preserves Arabic letters (and Latin alphanumerics).
 * Uses Unicode property escapes so \p{L} keeps Arabic script intact.
 */
export const slugify = (value: string): string =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * A slug field that auto-generates from `sourceField` (default: "title") when empty,
 * but stays editable. Permalinks use the pattern `<slug>-<id>` (the numeric id is the
 * stable part), so editors can change the slug without breaking inbound links.
 */
export const slugField = (sourceField = 'title'): Field => ({
  name: 'slug',
  type: 'text',
  index: true,
  admin: {
    position: 'sidebar',
    description: 'يُولّد تلقائيًا من العنوان. الرابط الدائم يعتمد على المعرّف الرقمي، فيمكن تعديله بأمان.',
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (typeof value === 'string' && value.length > 0) return slugify(value)
        const source = data?.[sourceField]
        if (typeof source === 'string' && source.length > 0) return slugify(source)
        return value
      },
    ],
  },
})
