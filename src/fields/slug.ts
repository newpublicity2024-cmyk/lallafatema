import type { Field, TextFieldSingleValidation } from 'payload'

import { editorialOnly } from './visibility'

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
 * Top-level route segments an editor's slug must not shadow. A Category or Page whose
 * slug equals one of these would be permanently unreachable (Next resolves named
 * segments before the `[category]` catch-all) or would silently shadow real content.
 * Only single-segment, slugify-producible names are listed — dotted files like
 * `sitemap.xml` can never be produced by `slugify` (it strips the dot), so they can't
 * collide. `video` is intentionally absent: it is a legitimate category slug (the route
 * is the plural `/videos`).
 */
export const RESERVED_ROUTE_SLUGS = [
  'videos',
  'magazine',
  'search',
  'author',
  'preview',
  'newsletter',
  'healthz',
  'admin',
  'api',
] as const

/** True when `value` is a reserved route segment (or in the caller-supplied `extra` list). */
export function isReservedSlug(value: string, extra: readonly string[] = []): boolean {
  return new Set<string>([...RESERVED_ROUTE_SLUGS, ...extra]).has(value)
}

type SlugOptions = {
  /** Reject slugs that would shadow a real route (use on Categories/Pages, not Posts). */
  reserved?: boolean
  /** Extra reserved slugs beyond the route segments — e.g. the legal-page slugs, so a
   *  category can't shadow /about, /privacy, … which resolve as Pages. */
  reservedExtra?: readonly string[]
}

/**
 * A slug field that auto-generates from `sourceField` (default: "title") when empty,
 * but stays editable. Permalinks use the pattern `<slug>-<id>` (the numeric id is the
 * stable part), so editors can change the slug without breaking inbound links.
 *
 * Pass `{ reserved: true }` on collections whose slug becomes a top-level path segment
 * (Categories, Pages) to block reserved-route collisions before a non-technical editor
 * can create an unreachable page.
 */
export const slugField = (sourceField = 'title', opts: SlugOptions = {}): Field => ({
  name: 'slug',
  type: 'text',
  index: true,
  admin: {
    position: 'sidebar',
    // Auto-generated and safe to change, but it is still a URL — not something a
    // non-technical writer should have to look at. Editorial roles keep it.
    //
    // CAUTION: Payload computes `skipValidationFromHere = skipValidation ||
    // !passesCondition`, so hiding a field ALSO skips its `validate`. The
    // reserved-slug guard below is therefore only enforced for users who can see
    // the field. That is safe today because the two collections using
    // `reserved: true` (Categories, Pages) are admin/editor-only anyway. If
    // `reserved: true` is ever added to a journalist-writable collection, move
    // the check into a beforeValidate hook instead — a condition will not run it.
    condition: editorialOnly,
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
  ...(opts.reserved
    ? {
        validate: ((value: string | null | undefined) => {
          if (typeof value === 'string' && isReservedSlug(value, opts.reservedExtra)) {
            return `المعرّف "${value}" محجوز لمسار في الموقع، اختر معرّفًا آخر.`
          }
          return true
        }) as TextFieldSingleValidation,
      }
    : {}),
})
