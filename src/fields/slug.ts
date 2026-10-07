import type { Field, TextFieldSingleValidation } from 'payload'
import { APIError } from 'payload'

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
      /**
       * Slugify, then DE-DUPLICATE.
       *
       * Generation alone used to be the whole hook, and nothing anywhere made the result
       * unique: two articles filed under the same headline — an everyday occurrence on a
       * magazine site — received the byte-identical slug, and hand-typing an already-taken
       * slug was accepted silently. Permalinks are `<slug>-<id>` so nothing 404s, but the
       * result is two live URLs that differ only by a trailing number: duplicate-looking
       * canonicals in the sitemap and in search results, and a `slug` column no later code
       * can use as a key.
       *
       * Deliberately NOT a database unique constraint. Dev and prod share one Neon
       * instance with `push: false`, and existing rows may already collide, so a
       * constraint would fail to apply and would reject edits to historical content.
       * Suffixing new slugs fixes the flow without touching what is already stored.
       *
       * THE QUERY IS SKIPPED WHEN THE SLUG HAS NOT CHANGED. Posts autosave every ~375ms,
       * so an unconditional lookup would mean a database round trip per keystroke; a
       * document that already owns its slug keeps it without asking.
       */
      async ({ value, data, req, originalDoc, collection }) => {
        // Whether the slug was TYPED or merely derived decides what a collision means.
        const explicit = typeof value === 'string' && value.length > 0

        const base = explicit
          ? slugify(value)
          : typeof data?.[sourceField] === 'string' && (data[sourceField] as string).length > 0
            ? slugify(data[sourceField] as string)
            : value

        if (typeof base !== 'string' || base.length === 0) return value

        const collectionSlug = collection?.slug
        if (!req?.payload || !collectionSlug) return base

        const currentId = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id
        const storedSlug = (originalDoc as { slug?: unknown } | undefined)?.slug

        // Already ours, unchanged — nothing to check, and nothing to pay for.
        if (typeof storedSlug === 'string' && storedSlug === base) return base

        try {
          const { docs } = await req.payload.find({
            collection: collectionSlug as Parameters<typeof req.payload.find>[0]['collection'],
            where: { slug: { like: `${base}%` } },
            limit: 200,
            depth: 0,
            pagination: false,
            overrideAccess: true,
          })

          const taken = new Set(
            docs
              .filter((d) => (currentId === undefined ? true : String(d.id) !== String(currentId)))
              .map((d) => (d as { slug?: unknown }).slug)
              .filter((sl): sl is string => typeof sl === 'string'),
          )

          if (!taken.has(base)) return base

          // A TYPED slug that is already taken is refused, not quietly renamed. An editor
          // who chose this URL deliberately needs to know it is gone; silently handing
          // them `...-2` is how you end up with a link that was never checked.
          if (explicit) {
            throw new APIError(`المعرّف "${base}" مستخدم في مقال آخر. اختر معرّفًا مختلفًا.`, 400)
          }

          // A GENERATED slug just needs to be distinct — two articles may legitimately
          // share a headline. `-2` reads as "the second one with this title".
          let n = 2
          while (taken.has(`${base}-${n}`)) n += 1
          return `${base}-${n}`
        } catch (err) {
          // Deliberate rejections must propagate; only an infrastructure failure is
          // swallowed, because a possibly-duplicate slug beats an editor who cannot save.
          if (err instanceof APIError) throw err
          return base
        }
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
