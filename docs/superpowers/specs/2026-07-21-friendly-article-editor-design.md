# Friendly article authoring for journalists

**Date:** 2026-07-21
**Status:** approved

## Problem

The journalists who write for Lalla Fatema are not technical. The Posts edit screen
currently asks them to reason about things they have no basis to decide:

- The sidebar carries seven controls: media type, recipe toggle, category, tags,
  author, publish date and the URL slug.
- The `seo` group (meta title, meta description, OG image, canonical URL, noindex)
  sits in the main editing column, directly below the article body.
- `authors` is visible but not editable by journalists — field-level access already
  blocks them — so it is pure noise.
- Videos can only be attached to the article header. There is no way to place a
  video between paragraphs.
- `content` is not `required`, so an empty article can be saved.

The pieces that already work well and must survive unchanged: autosave, live
preview, drafts, version history, the Arabic/RTL admin, and the journalist
publish-lock in `Posts.beforeChange`.

## Approach

Role-adaptive simplification driven by Payload configuration, plus two small
presentational React components. No custom edit view: rebuilding the edit screen
would mean reimplementing autosave, live preview, version history, validation and
the upload UI, which is a large amount of risk for a cosmetic gain.

Admins and editors keep exactly the screen they have today. Only the journalist
view is reduced.

## Field visibility

A shared helper decides visibility:

```ts
// src/fields/visibility.ts
export const isEditorialUser = (user) =>
  user?.role === 'admin' || user?.role === 'editor'

export const editorialOnly: Condition = (_data, _siblingData, { user }) =>
  isEditorialUser(user)
```

Applied as `admin.condition` to: `slug`, `seo`, `tags`, `authors` and
`publishedAt`. `legacyWpId` is already `admin.hidden`; `featuredType` becomes
`admin.hidden` too (see below).

What a journalist is left with:

| Position | Field               | Required        |
| -------- | ------------------- | --------------- |
| main     | `title`             | yes             |
| main     | `featuredImage`     | no              |
| main     | `featuredVideoUrl`  | no              |
| main     | `content`           | yes (new)       |
| main     | `excerpt`           | no, auto-filled |
| sidebar  | `category`          | yes             |

The recipe fields (`isRecipe`, `recipe`) stay visible to all roles — they are
already collapsed behind a checkbox and kitchen writers need them.

**Security note:** `admin.condition` hides a field in the UI only; it does not
block an API write. That is acceptable for every field listed, because none of
them is a privilege boundary. `authors` — the one field that *is* a boundary —
already has field-level `access.update: isAdminOrEditorFieldLevel` and keeps it.

## Automation

Already automatic, now simply invisible to journalists:

- **slug** — `slugField('title')` generates it from the Arabic title.
- **authors** — defaults to the creating user in `beforeChange`.
- **publishedAt** — stamped on first publish in `beforeChange`.
- **seo** — the public metadata layer already falls back to title, excerpt and
  featured image when the group is blank.

New automation:

- **`featuredType`** — derived in `beforeChange` rather than chosen: a non-empty
  `featuredVideoUrl` yields `'video'`, otherwise `'image'`. The stored value keeps
  the same shape, so `ArticleView` needs no change.

  Because the value is now fully determined by the data, the field is hidden from
  *every* role rather than being editorial-only. Leaving it visible to editors
  would let them pick a value that the hook then silently overwrites.

  Two consequences for `featuredVideoUrl`, both required for this to work at all:

  1. Its current `admin.condition: (data) => data?.featuredType === 'video'` must
     be **removed**. With `featuredType` derived from the URL, that condition is
     circular — the field would only appear once a URL had been saved, which can
     never happen because the field is hidden until then.
  2. Its current `validate` — which demands a URL whenever `featuredType` is
     `'video'` — becomes a tautology for the same reason. It is replaced by: if a
     value is present it must parse as a URL; blank is always valid.

  The resulting mental model for a writer is simply "paste a video link and the
  article gets a video header; leave it blank and it gets an image header."
- **`excerpt`** — when blank, derived in `beforeChange` from the article body:
  Lexical JSON flattened to plain text, collapsed whitespace, truncated to 160
  characters at a word boundary with an ellipsis. Extraction is a pure function so
  it is unit-testable without a database.

## Video inside the article body

A `videoEmbed` block registered on the Lexical editor through `BlocksFeature`:

| Field     | Type | Required | Notes                                       |
| --------- | ---- | -------- | ------------------------------------------- |
| `url`     | text | yes      | validated as a URL, same shape as `featuredVideoUrl` |
| `caption` | text | no       | shown under the player                      |

Rendering: `ArticleView` gains a `converters` prop mapping `blocks.videoEmbed` to
the existing `VideoPlayer` component, which already handles YouTube/Vimeo parsing
and click-to-load.

Lexical blocks are stored inside the existing `jsonb` content column, so this
requires **no database migration** — which matters because dev and production
share one Neon database and the Postgres adapter runs with `push: false`.

## Rich-text toolbar

Restricted to what a journalist actually uses: bold, italic, underline, link,
H2/H3, bulleted and numbered lists, quote, image upload, horizontal rule, and the
new video block. Removed: subscript, superscript, inline code, checklist,
strikethrough, relationship, alignment, indent.

This was verified safe against production data before being adopted. A recursive
scan of all 1060 posts found only these node types — `text`, `paragraph`,
`listitem`, `heading`, `root`, `linebreak`, `upload`, `list`, `link`, `quote` —
with headings limited to `h2`/`h3`, lists to `ul`/`ol`, and text format bitmasks
of only 1 (bold), 2 (italic) and 3 (both). No existing node uses a feature being
removed, so no historical content can lose its formatting.

## Custom components

Both are `ui`-type fields, so neither touches the database schema.

1. **Guidance banner** — top of the form, journalists only. Explains in two
   sentences that they write a title and the article, that everything else is
   handled automatically, and that saving is automatic.
2. **Publish-readiness checklist** — sidebar. Live checkmarks for title, category,
   cover image and content, read from form state via `useFormFields`. Advisory
   only: real enforcement stays in field validation and the existing
   journalist publish-lock.

## Copy changes

`Media.alt` stays `required` — it is load-bearing for accessibility and SEO — but
is relabelled into plain Arabic with a concrete example instead of the current
description that uses the words "الوصول" and "محركات البحث".

## Testing

Unit:
- excerpt extraction: nested nodes, empty content, text shorter than the limit,
  word-boundary truncation, whitespace collapsing
- `featuredType` derivation from the presence of a video URL
- video block URL validation

Integration:
- a post created by a journalist without submitting slug, author, excerpt or
  featuredType comes back with all four correctly populated

E2E (extends `tests/e2e/admin.e2e.spec.ts`):
- a journalist sees the reduced field set and does not see slug or SEO
- an admin still sees slug and SEO on the same collection
- the video URL field is visible on a brand-new post — this is the regression
  guard for the circular-condition bug described above

## Out of scope

- Any change to the public-facing article rendering beyond the video block converter
- Changes to the Videos collection or the magazine feature
- Reworking the Media library browsing experience
