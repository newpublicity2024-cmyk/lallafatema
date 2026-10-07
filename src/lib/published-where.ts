import type { Where } from 'payload'

/**
 * The single definition of "the public may see this post".
 *
 * It lives in its own dependency-free module because two very different layers need the
 * SAME rule and must not be able to drift apart:
 *
 *   - `src/lib/queries.ts`, which builds every rendered listing. The Local API defaults
 *     to `overrideAccess: true`, so those queries bypass access control entirely and
 *     carry this predicate themselves.
 *   - `src/access/index.ts`, which governs the REST/GraphQL API. `/api/posts` answers
 *     anonymously, so without this a scheduled story is one public fetch away even while
 *     every page correctly hides it.
 *
 * Importing it from `queries.ts` into `access/index.ts` would close a cycle
 * (access → collections → payload.config → queries → payload → payload.config), hence a
 * leaf module that imports nothing but a type.
 *
 * `_status` alone was the bug: `publishedAt` is an editor-facing day-and-time picker
 * labelled "تاريخ النشر", and a story dated next Tuesday went live immediately and — since
 * listings sort `-publishedAt` — sorted above today's news.
 *
 * A FUNCTION, never a const: a module-level `new Date()` freezes at import, so a
 * long-running server would keep comparing against its boot time and scheduled posts
 * would never appear.
 *
 * A missing `publishedAt` stays visible. `applyPostDefaults` stamps it on first publish
 * (measured: 0 of 1,538 published posts lack one), but absent is not "in the future" and
 * a row that loses it must not silently disappear from the site.
 */
export const publishedWhere = (): Where => ({
  and: [
    { _status: { equals: 'published' } },
    {
      or: [
        { publishedAt: { less_than_equal: new Date().toISOString() } },
        { publishedAt: { exists: false } },
      ],
    },
  ],
})

/** True when a date is set and still in the future. The single-document mirror of the above. */
export const isScheduledForLater = (publishedAt: unknown): boolean =>
  typeof publishedAt === 'string' && new Date(publishedAt).getTime() > Date.now()
