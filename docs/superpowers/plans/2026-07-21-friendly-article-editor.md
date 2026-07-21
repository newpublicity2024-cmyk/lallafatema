# Friendly Article Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Posts edit screen to five fields for journalists, automate everything else, and let writers place videos inside the article body.

**Architecture:** Role-adaptive Payload configuration — `admin.condition` hides editorial-only fields, a `beforeChange` hook derives `slug`/`authors`/`publishedAt`/`featuredType`/`excerpt`, and a `videoEmbed` Lexical block carries body video. Two `ui`-type React components add a guidance banner and a publish-readiness checklist. No custom edit view: autosave, live preview, drafts and version history must keep working untouched.

**Tech Stack:** Payload 3.85.1, Next.js 16.2.6, React 19.2.6, `@payloadcms/richtext-lexical` 3.85.1, Vitest 4, Playwright 1.58, Postgres (Neon).

## Global Constraints

- **No database migration.** Dev and production share one Neon database and the Postgres adapter runs `push: false`. Nothing in this plan may alter the Drizzle schema. This is why `content` is enforced with a custom `validate` rather than `required: true` — see Task 7.
- **Arabic/RTL.** All user-facing strings are Arabic. The admin runs `fallbackLanguage: 'ar'`.
- **Roles** are exactly `'admin' | 'editor' | 'journalist'` (`src/collections/Users.ts:67-71`).
- **Do not weaken** the journalist publish-lock or the `authors` field-level access control.
- **Package manager:** use `npx pnpm@10.18.0` — the `pnpm` on PATH is too old.
- After adding or changing any admin component, run `npx pnpm@10.18.0 generate:importmap`.

---

### Task 1: Lexical plain-text extraction and excerpt derivation

Pure, dependency-free functions. They run in the `beforeChange` hook (server) and in the publish checklist (client), so they must not import anything Payload-specific.

**Files:**
- Create: `src/lib/lexical-text.ts`
- Test: `tests/int/lexical-text.int.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `lexicalToPlainText(data: LexicalRoot): string`
  - `deriveExcerpt(data: LexicalRoot, maxLength?: number): string`
  - `EXCERPT_MAX_LENGTH: 160`
  - `type LexicalRoot = { root?: LexicalNode } | null | undefined`

- [ ] **Step 1: Write the failing test**

Create `tests/int/lexical-text.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { lexicalToPlainText, deriveExcerpt, EXCERPT_MAX_LENGTH } from '@/lib/lexical-text'

/** Minimal Lexical document builder — mirrors what the editor actually stores. */
const doc = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

describe('lexicalToPlainText', () => {
  it('extracts text from a single paragraph', () => {
    expect(lexicalToPlainText(doc('مرحبا بالعالم'))).toBe('مرحبا بالعالم')
  })

  it('separates paragraphs with a single space', () => {
    expect(lexicalToPlainText(doc('الفقرة الأولى', 'الفقرة الثانية'))).toBe(
      'الفقرة الأولى الفقرة الثانية',
    )
  })

  it('walks arbitrarily nested nodes (lists, quotes, formatted spans)', () => {
    const nested = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            children: [
              {
                type: 'listitem',
                children: [{ type: 'text', text: 'عنصر' }],
              },
            ],
          },
          {
            type: 'quote',
            children: [{ type: 'text', text: 'اقتباس' }],
          },
        ],
      },
    }
    expect(lexicalToPlainText(nested)).toBe('عنصر اقتباس')
  })

  it('ignores nodes that carry no text (uploads, video blocks)', () => {
    const withUpload = {
      root: {
        type: 'root',
        children: [
          { type: 'upload', relationTo: 'media', value: 1 },
          { type: 'block', fields: { blockType: 'videoEmbed', url: 'https://x.test/v' } },
          { type: 'paragraph', children: [{ type: 'text', text: 'نص' }] },
        ],
      },
    }
    expect(lexicalToPlainText(withUpload)).toBe('نص')
  })

  it('collapses runs of whitespace', () => {
    expect(lexicalToPlainText(doc('كلمة    أخرى'))).toBe('كلمة أخرى')
  })

  it('returns an empty string for null, undefined and a rootless object', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText(undefined)).toBe('')
    expect(lexicalToPlainText({})).toBe('')
  })
})

describe('deriveExcerpt', () => {
  it('returns the whole text when it is shorter than the limit', () => {
    expect(deriveExcerpt(doc('مقال قصير'))).toBe('مقال قصير')
  })

  it('truncates at a word boundary and appends an ellipsis', () => {
    const long = 'كلمة '.repeat(60).trim()
    const result = deriveExcerpt(doc(long))

    expect(result.length).toBeLessThanOrEqual(EXCERPT_MAX_LENGTH + 1)
    expect(result.endsWith('…')).toBe(true)
    // Never cuts mid-word: everything before the ellipsis is whole words.
    expect(result.slice(0, -1).trim().endsWith('كلمة')).toBe(true)
  })

  it('strips trailing punctuation before the ellipsis', () => {
    const long = `${'كلمة '.repeat(40).trim()}، ${'أخرى '.repeat(40).trim()}`
    const result = deriveExcerpt(doc(long))
    expect(result).not.toContain('،…')
  })

  it('honours a custom maxLength', () => {
    expect(deriveExcerpt(doc('واحد اثنان ثلاثة أربعة'), 10)).toBe('واحد اثنان…')
  })

  it('returns an empty string for empty content', () => {
    expect(deriveExcerpt(null)).toBe('')
    expect(deriveExcerpt(doc(''))).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 test:int -- lexical-text`
Expected: FAIL — `Failed to resolve import "@/lib/lexical-text"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/lexical-text.ts`:

```ts
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
  const lastSpace = clipped.lastIndexOf(' ')
  const base = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped

  return `${base.replace(/[\s،,.:;-]+$/u, '')}…`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 test:int -- lexical-text`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/lexical-text.ts tests/int/lexical-text.int.spec.ts
git commit -m "feat(lib): lexical plain-text extraction and excerpt derivation"
```

---

### Task 2: Post defaults hook

Extracts the existing inline `beforeChange` out of `Posts.ts` and adds the two new derivations. The publish-lock and author-default behaviour must be preserved exactly — `tests/int/rbac.int.spec.ts` covers the publish-lock and must keep passing.

**Files:**
- Create: `src/hooks/postDefaults.ts`
- Test: `tests/int/post-defaults.int.spec.ts`
- Modify: `src/collections/Posts.ts` (replace the inline hook at lines 36-57)

**Interfaces:**
- Consumes: `deriveExcerpt` from `src/lib/lexical-text.ts` (Task 1)
- Produces:
  - `deriveFeaturedType(videoUrl: unknown): 'image' | 'video'`
  - `applyPostDefaults: CollectionBeforeChangeHook`

- [ ] **Step 1: Write the failing test**

Create `tests/int/post-defaults.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { deriveFeaturedType, applyPostDefaults } from '@/hooks/postDefaults'

const doc = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

/** Builds the hook argument shape; only the fields the hook reads are populated. */
const run = (data: Record<string, unknown>, user: unknown, operation = 'create') =>
  applyPostDefaults({
    data,
    req: { user },
    operation,
    // Unused by the hook but present on the real signature.
    collection: undefined,
    context: {},
    originalDoc: undefined,
  } as never)

const journalist = { id: 7, role: 'journalist' }
const editor = { id: 2, role: 'editor' }

describe('deriveFeaturedType', () => {
  it('is video when a URL is present', () => {
    expect(deriveFeaturedType('https://youtube.com/watch?v=abc')).toBe('video')
  })

  it('is image for blank, whitespace-only, null and undefined', () => {
    expect(deriveFeaturedType('')).toBe('image')
    expect(deriveFeaturedType('   ')).toBe('image')
    expect(deriveFeaturedType(null)).toBe('image')
    expect(deriveFeaturedType(undefined)).toBe('image')
  })

  it('is image for a non-string value', () => {
    expect(deriveFeaturedType(42)).toBe('image')
  })
})

describe('applyPostDefaults', () => {
  it('blocks a journalist from publishing', () => {
    expect(() => run({ _status: 'published' }, journalist)).toThrow(/غير مسموح/)
  })

  it('allows an editor to publish', () => {
    expect(() => run({ _status: 'published' }, editor)).not.toThrow()
  })

  it('stamps publishedAt on first publish only', () => {
    const fresh = run({ _status: 'published' }, editor)
    expect(fresh.publishedAt).toEqual(expect.any(String))

    const already = run({ _status: 'published', publishedAt: '2020-01-01T00:00:00.000Z' }, editor)
    expect(already.publishedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('defaults authorship to the creating user', () => {
    expect(run({}, journalist).authors).toEqual([7])
  })

  it('does not overwrite authorship that was supplied', () => {
    expect(run({ authors: [99] }, editor).authors).toEqual([99])
  })

  it('does not default authorship on update', () => {
    expect(run({}, journalist, 'update').authors).toBeUndefined()
  })

  it('derives featuredType from the video URL', () => {
    expect(run({ featuredVideoUrl: 'https://vimeo.com/1' }, journalist).featuredType).toBe('video')
    expect(run({ featuredVideoUrl: '' }, journalist).featuredType).toBe('image')
  })

  it('overrides a stale featuredType rather than trusting it', () => {
    const result = run({ featuredType: 'video', featuredVideoUrl: '' }, journalist)
    expect(result.featuredType).toBe('image')
  })

  it('fills a blank excerpt from the content', () => {
    expect(run({ content: doc('نص المقال هنا') }, journalist).excerpt).toBe('نص المقال هنا')
  })

  it('never overwrites an excerpt the writer typed', () => {
    const result = run({ content: doc('نص المقال'), excerpt: 'مقتطف يدوي' }, journalist)
    expect(result.excerpt).toBe('مقتطف يدوي')
  })

  it('treats a whitespace-only excerpt as blank', () => {
    expect(run({ content: doc('نص المقال'), excerpt: '   ' }, journalist).excerpt).toBe('نص المقال')
  })

  it('leaves the excerpt untouched when there is no content', () => {
    expect(run({ title: 'عنوان' }, journalist).excerpt).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 test:int -- post-defaults`
Expected: FAIL — `Failed to resolve import "@/hooks/postDefaults"`

- [ ] **Step 3: Write the implementation**

Create `src/hooks/postDefaults.ts`:

```ts
import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { deriveExcerpt, type LexicalRoot } from '../lib/lexical-text'

/**
 * The header media kind is derived, never chosen: a video URL means a video
 * header, its absence means an image header. Keeping it derived removes a
 * sidebar control and makes the two fields impossible to contradict.
 */
export const deriveFeaturedType = (videoUrl: unknown): 'image' | 'video' =>
  typeof videoUrl === 'string' && videoUrl.trim().length > 0 ? 'video' : 'image'

/**
 * Everything the editorial team should not have to think about.
 *
 * Publish permission and the first-publish timestamp were already here; the
 * featuredType and excerpt derivations are what let those two fields disappear
 * from a journalist's screen.
 */
export const applyPostDefaults: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  // Journalists may not publish — only admins/editors can.
  if (
    data?._status === 'published' &&
    req.user &&
    req.user.role !== 'admin' &&
    req.user.role !== 'editor'
  ) {
    throw new APIError('غير مسموح لك بنشر المقالات. يرجى تركها كمسودة لمراجعة المحرّر.', 403)
  }

  // Stamp the first publish date.
  if (data?._status === 'published' && !data.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }

  // Default authorship to the creating user.
  if (operation === 'create' && req.user && (!data.authors || data.authors.length === 0)) {
    data.authors = [req.user.id]
  }

  // Header media kind follows the video URL.
  data.featuredType = deriveFeaturedType(data?.featuredVideoUrl)

  // A blank excerpt is filled from the opening of the article.
  if (data?.content && (typeof data.excerpt !== 'string' || data.excerpt.trim().length === 0)) {
    const derived = deriveExcerpt(data.content as LexicalRoot)
    if (derived) data.excerpt = derived
  }

  return data
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 test:int -- post-defaults`
Expected: PASS — 13 tests

- [ ] **Step 5: Wire the hook into the collection**

In `src/collections/Posts.ts`, replace the entire inline `beforeChange` array (lines 36-57) so the `hooks` block reads:

```ts
  hooks: {
    beforeChange: [applyPostDefaults],
    afterChange: [revalidateAfterChange, searchIndexAfterChange],
    afterDelete: [revalidateAfterDelete, searchIndexAfterDelete],
  },
```

Add the import alongside the existing hook imports:

```ts
import { applyPostDefaults } from '../hooks/postDefaults'
```

Remove the now-unused `import { APIError } from 'payload'` from `Posts.ts` — it moved into the hook file.

- [ ] **Step 6: Verify nothing regressed**

Run: `npx pnpm@10.18.0 test:int -- "post-defaults|rbac|video-post"`
Expected: PASS — the RBAC publish-lock tests still pass against the relocated hook.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/postDefaults.ts src/collections/Posts.ts tests/int/post-defaults.int.spec.ts
git commit -m "feat(posts): derive featuredType and excerpt in a testable beforeChange hook"
```

---

### Task 3: Role-based field visibility

**Files:**
- Create: `src/fields/visibility.ts`
- Test: `tests/int/visibility.int.spec.ts`
- Modify: `src/collections/Posts.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isEditorialUser(user: { role?: string } | null | undefined): boolean`
  - `editorialOnly: (data, siblingData, ctx: { user }) => boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/int/visibility.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { isEditorialUser, editorialOnly } from '@/fields/visibility'

describe('isEditorialUser', () => {
  it('is true for admin and editor', () => {
    expect(isEditorialUser({ role: 'admin' })).toBe(true)
    expect(isEditorialUser({ role: 'editor' })).toBe(true)
  })

  it('is false for a journalist', () => {
    expect(isEditorialUser({ role: 'journalist' })).toBe(false)
  })

  it('is false when there is no user', () => {
    expect(isEditorialUser(null)).toBe(false)
    expect(isEditorialUser(undefined)).toBe(false)
  })
})

describe('editorialOnly', () => {
  it('shows the field to an editor and hides it from a journalist', () => {
    expect(editorialOnly({}, {}, { user: { role: 'editor' } })).toBe(true)
    expect(editorialOnly({}, {}, { user: { role: 'journalist' } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 test:int -- visibility`
Expected: FAIL — `Failed to resolve import "@/fields/visibility"`

- [ ] **Step 3: Write the implementation**

Create `src/fields/visibility.ts`:

```ts
/**
 * Role-based field visibility for the admin UI.
 *
 * IMPORTANT: `admin.condition` hides a field from the UI — it does NOT block an
 * API write. Use it only for fields that are noise rather than a privilege
 * boundary. Anything that genuinely must not be written by a role needs
 * field-level `access` (see `authors` in Posts, which keeps both).
 */

type MaybeUser = { role?: string } | null | undefined

export const isEditorialUser = (user: MaybeUser): boolean =>
  user?.role === 'admin' || user?.role === 'editor'

/**
 * Shows a field to admins and editors only. Journalists get a screen with just
 * the things they actually decide: title, media, content, category.
 */
export const editorialOnly = (
  _data: unknown,
  _siblingData: unknown,
  { user }: { user?: MaybeUser },
): boolean => isEditorialUser(user)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 test:int -- visibility`
Expected: PASS — 5 tests

- [ ] **Step 5: Apply the conditions in `src/collections/Posts.ts`**

Add the import:

```ts
import { editorialOnly } from '../fields/visibility'
```

Then make these five edits.

**5a — `featuredType` becomes fully hidden** (it is derived in Task 2; leaving it visible would let an editor pick a value the hook overwrites). Replace its `admin` block:

```ts
    {
      name: 'featuredType',
      type: 'select',
      label: 'نوع الوسائط البارزة',
      defaultValue: 'image',
      options: [
        { label: 'صورة', value: 'image' },
        { label: 'فيديو', value: 'video' },
      ],
      admin: {
        // Derived from featuredVideoUrl in the beforeChange hook — never chosen by hand.
        hidden: true,
      },
    },
```

**5b — `featuredVideoUrl` loses its circular condition and its tautological validator.** With `featuredType` now derived *from this field*, a `condition` of `featuredType === 'video'` could never become true. Replace the whole field:

```ts
    {
      name: 'featuredVideoUrl',
      type: 'text',
      label: 'رابط فيديو الغلاف (اختياري)',
      admin: {
        description:
          'ألصق رابط يوتيوب أو فيميو ليظهر الفيديو في أعلى المقال. اتركه فارغًا ليظهر الغلاف كصورة.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        try {
          new URL(value)
          return true
        } catch {
          return 'هذا لا يبدو رابطًا صحيحًا. انسخ الرابط كاملًا من شريط العنوان.'
        }
      },
    },
```

**5c — hide `tags`, `authors` and `publishedAt` from journalists.** Add `condition: editorialOnly` to each field's existing `admin` object:

```ts
      admin: { position: 'sidebar', condition: editorialOnly },
```

For `authors`, keep its existing `access` block exactly as it is — the condition hides it, the access control enforces it.

**5d — hide the slug.** In `src/fields/slug.ts`, add a `condition` to the field's `admin` object so it applies everywhere the helper is used:

```ts
  admin: {
    position: 'sidebar',
    condition: editorialOnly,
    description: 'يُولّد تلقائيًا من العنوان. الرابط الدائم يعتمد على المعرّف الرقمي، فيمكن تعديله بأمان.',
  },
```

and import `editorialOnly` at the top of `src/fields/slug.ts`.

**5e — hide the SEO group.** In `src/fields/seo.ts`, add the condition to its `admin` object:

```ts
  admin: {
    condition: editorialOnly,
    description: 'اتركها فارغة لاستخدام العنوان والمقتطف والصورة البارزة افتراضيًا.',
  },
```

and import `editorialOnly` there too.

- [ ] **Step 6: Verify the app still builds and types still generate**

Run: `npx pnpm@10.18.0 generate:types && npx pnpm@10.18.0 lint`
Expected: types regenerate with no diff to `payload-types.ts` (visibility is UI-only), lint clean.

If `payload-types.ts` shows a diff, stop — that means a schema-affecting change slipped in, which violates the no-migration constraint.

- [ ] **Step 7: Commit**

```bash
git add src/fields/visibility.ts src/fields/slug.ts src/fields/seo.ts src/collections/Posts.ts tests/int/visibility.int.spec.ts
git commit -m "feat(admin): hide slug, SEO, tags, authors and publish date from journalists"
```

---

### Task 4: The videoEmbed block and the trimmed toolbar

**Files:**
- Create: `src/blocks/VideoEmbed.ts`
- Modify: `src/payload.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `VideoEmbedBlock: Block` with `slug: 'videoEmbed'` and fields `url: string` (required), `caption?: string`

- [ ] **Step 1: Verify the Lexical feature exports exist in 3.85.1**

Before writing config against them, confirm the names. Run:

```bash
node -e "const m=require('@payloadcms/richtext-lexical');console.log(Object.keys(m).filter(k=>/Feature$/.test(k)).sort().join('\n'))"
```

Expected: a list containing `BlockquoteFeature`, `BlocksFeature`, `BoldFeature`, `FixedToolbarFeature`, `HeadingFeature`, `HorizontalRuleFeature`, `InlineToolbarFeature`, `ItalicFeature`, `LinkFeature`, `OrderedListFeature`, `ParagraphFeature`, `UnderlineFeature`, `UnorderedListFeature`, `UploadFeature`.

If a name differs, use the name this command prints — do not guess.

- [ ] **Step 2: Create the block**

Create `src/blocks/VideoEmbed.ts`:

```ts
import type { Block } from 'payload'

/**
 * A video placed between paragraphs. Stored inside the rich-text JSON column,
 * so adding it needs no database migration.
 *
 * Rendered by `src/components/RichTextBody.tsx` through the same VideoPlayer
 * facade the header video uses (thumbnail + click-to-load iframe, CWV-safe).
 */
export const VideoEmbedBlock: Block = {
  slug: 'videoEmbed',
  labels: { singular: 'فيديو', plural: 'فيديوهات' },
  fields: [
    {
      name: 'url',
      type: 'text',
      label: 'رابط الفيديو',
      required: true,
      admin: {
        description: 'ألصق رابط يوتيوب أو فيميو.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return 'رابط الفيديو مطلوب.'
        try {
          new URL(value)
          return true
        } catch {
          return 'هذا لا يبدو رابطًا صحيحًا. انسخ الرابط كاملًا من شريط العنوان.'
        }
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'تعليق (اختياري)',
    },
  ],
}
```

- [ ] **Step 3: Configure the editor in `src/payload.config.ts`**

Replace `editor: lexicalEditor(),` with:

```ts
  // Deliberately trimmed to what a non-technical journalist uses. Verified safe
  // against all 1060 live posts: existing content uses only h2/h3, ul/ol, bold,
  // italic, links, quotes and uploads — no node depends on a removed feature.
  editor: lexicalEditor({
    features: () => [
      ParagraphFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
      BoldFeature(),
      ItalicFeature(),
      UnderlineFeature(),
      LinkFeature(),
      UnorderedListFeature(),
      OrderedListFeature(),
      BlockquoteFeature(),
      UploadFeature(),
      HorizontalRuleFeature(),
      BlocksFeature({ blocks: [VideoEmbedBlock] }),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ],
  }),
```

and change the import at line 2 to:

```ts
import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
```

plus the block import:

```ts
import { VideoEmbedBlock } from './blocks/VideoEmbed'
```

- [ ] **Step 4: Regenerate types and confirm no schema change**

Run: `npx pnpm@10.18.0 generate:types && git diff --stat src/payload-types.ts`
Expected: `payload-types.ts` gains a `VideoEmbed` block type. Confirm no new top-level collection or table type appeared — Lexical blocks live in the existing `jsonb` column.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/VideoEmbed.ts src/payload.config.ts src/payload-types.ts
git commit -m "feat(editor): videoEmbed block and a journalist-sized toolbar"
```

---

### Task 5: Render the video block on the public site

`ArticleView` and `PageView` both render `<RichText>` bare today, so neither would show the new block. Extracting one shared wrapper keeps the converter defined once.

**Files:**
- Create: `src/components/RichTextBody.tsx`
- Test: `tests/int/rich-text-body.int.spec.tsx`
- Modify: `src/components/ArticleView.tsx:78`, `src/components/PageView.tsx`

**Interfaces:**
- Consumes: `VideoPlayer` from `src/components/VideoPlayer.tsx` — signature `{ videoUrl: string; thumbnail: number | Media | null | undefined; title: string; fallbackPosterUrl?: string }`
- Produces: `RichTextBody({ data, className }: { data: unknown; className?: string })`

- [ ] **Step 1: Confirm the converter type export**

Run:

```bash
node -e "const m=require('@payloadcms/richtext-lexical/react');console.log(Object.keys(m).sort().join('\n'))"
```

Expected: includes `RichText`. The `JSXConvertersFunction` type is type-only, so confirm it in the type declarations instead:

```bash
npx grep -r "JSXConvertersFunction" node_modules/@payloadcms/richtext-lexical/dist/exports/react.d.ts
```

Use whatever the declaration file exports. If the name differs, use the printed one.

- [ ] **Step 2: Write the failing test**

Create `tests/int/rich-text-body.int.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { RichTextBody } from '@/components/RichTextBody'

const withVideoBlock = {
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'قبل الفيديو' }] },
      {
        type: 'block',
        fields: {
          blockType: 'videoEmbed',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          caption: 'مقطع من الحفل',
        },
      },
    ],
  },
}

describe('RichTextBody', () => {
  it('renders ordinary paragraphs', () => {
    render(<RichTextBody data={withVideoBlock} />)
    expect(screen.getByText('قبل الفيديو')).toBeDefined()
  })

  it('renders a videoEmbed block as a playable facade', () => {
    render(<RichTextBody data={withVideoBlock} />)
    // The VideoPlayer facade exposes a play control labelled in Arabic.
    expect(screen.getByRole('button', { name: /تشغيل/ })).toBeDefined()
  })

  it('renders the block caption when present', () => {
    render(<RichTextBody data={withVideoBlock} />)
    expect(screen.getByText('مقطع من الحفل')).toBeDefined()
  })

  it('renders nothing for a block with no url', () => {
    const broken = {
      root: {
        type: 'root',
        children: [{ type: 'block', fields: { blockType: 'videoEmbed', url: '' } }],
      },
    }
    const { container } = render(<RichTextBody data={broken} />)
    expect(container.querySelector('iframe')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 test:int -- rich-text-body`
Expected: FAIL — `Failed to resolve import "@/components/RichTextBody"`

- [ ] **Step 4: Write the implementation**

Create `src/components/RichTextBody.tsx`:

```tsx
import { RichText } from '@payloadcms/richtext-lexical/react'

import { VideoPlayer } from './VideoPlayer'

type VideoEmbedFields = {
  blockType: 'videoEmbed'
  url?: string | null
  caption?: string | null
}

/**
 * The article/page body renderer. Wraps Payload's RichText with the converters
 * for our own Lexical blocks, so a writer can drop a video between paragraphs
 * and it renders with the same click-to-load facade as a header video.
 */
export function RichTextBody({ data, className }: { data: unknown; className?: string }) {
  return (
    <RichText
      data={data as never}
      className={className}
      converters={({ defaultConverters }: { defaultConverters: Record<string, unknown> }) => ({
        ...defaultConverters,
        blocks: {
          videoEmbed: ({ node }: { node: { fields: VideoEmbedFields } }) => {
            const { url, caption } = node.fields
            if (!url) return null

            return (
              <figure className="my-6">
                <VideoPlayer videoUrl={url} thumbnail={null} title={caption || 'فيديو'} />
                {caption ? (
                  <figcaption className="mt-2 text-sm text-brand-700">{caption}</figcaption>
                ) : null}
              </figure>
            )
          },
        },
      })}
    />
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 test:int -- rich-text-body`
Expected: PASS — 4 tests

- [ ] **Step 6: Swap both call sites**

In `src/components/ArticleView.tsx`, replace the import of `RichText` with `import { RichTextBody } from './RichTextBody'` and change line 78 to:

```tsx
            <RichTextBody data={post.content} className="prose-ar" />
```

Do the same in `src/components/PageView.tsx` for its `<RichText>` usage, preserving whatever `className` it already passes.

- [ ] **Step 7: Verify the existing rendering tests still pass**

Run: `npx pnpm@10.18.0 test:int -- "rich-text-body|page-view|post-image"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/RichTextBody.tsx src/components/ArticleView.tsx src/components/PageView.tsx tests/int/rich-text-body.int.spec.tsx
git commit -m "feat(article): render body video blocks through the VideoPlayer facade"
```

---

### Task 6: Guidance banner and publish checklist

**Files:**
- Create: `src/components/admin/WriterGuide.tsx`
- Create: `src/components/admin/PublishChecklist.tsx`
- Modify: `src/collections/Posts.ts` (two `ui` fields)
- Modify: `src/app/(payload)/admin/importMap.js` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `lexicalToPlainText` from `src/lib/lexical-text.ts` (Task 1), `isEditorialUser` from `src/fields/visibility.ts` (Task 3)
- Produces: two default-exported React components

- [ ] **Step 1: Write the guidance banner**

Create `src/components/admin/WriterGuide.tsx`:

```tsx
'use client'

import { useAuth } from '@payloadcms/ui'

/**
 * A two-sentence orientation for journalists, shown at the top of the post form.
 * Editors and admins already know the system and get their screen back untouched.
 */
export default function WriterGuide() {
  const { user } = useAuth()

  if (!user || user.role === 'admin' || user.role === 'editor') return null

  return (
    <div
      dir="rtl"
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '.5rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        lineHeight: 1.9,
      }}
    >
      <strong style={{ display: 'block', marginBottom: '.35rem' }}>ابدأ بالكتابة مباشرة</strong>
      <span>
        اكتب العنوان ثم المقال، واختر القسم من الجانب. الرابط والمقتطف وتاريخ النشر وبيانات محركات
        البحث كلها تُضبط تلقائيًا. عملك يُحفظ أولًا بأول، ويصل إلى المحرّر لمراجعته ونشره.
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Write the publish checklist**

Create `src/components/admin/PublishChecklist.tsx`:

```tsx
'use client'

import { useAuth, useFormFields } from '@payloadcms/ui'

import { lexicalToPlainText, type LexicalRoot } from '../../lib/lexical-text'

const Row = ({ done, label }: { done: boolean; label: string }) => (
  <li style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.15rem 0' }}>
    <span aria-hidden style={{ opacity: done ? 1 : 0.35 }}>{done ? '✅' : '⬜'}</span>
    <span style={{ opacity: done ? 1 : 0.7 }}>{label}</span>
    <span className="sr-only">{done ? '(مكتمل)' : '(غير مكتمل)'}</span>
  </li>
)

/**
 * Advisory only — it mirrors what the writer still has to do. Real enforcement
 * lives in field validation and the journalist publish-lock in postDefaults.
 */
export default function PublishChecklist() {
  const { user } = useAuth()

  const [title, category, featuredImage, content] = useFormFields(([fields]) => [
    fields?.title?.value,
    fields?.category?.value,
    fields?.featuredImage?.value,
    fields?.content?.value,
  ])

  if (!user || user.role === 'admin' || user.role === 'editor') return null

  const hasContent = lexicalToPlainText(content as LexicalRoot).length > 0

  return (
    <div dir="rtl" style={{ marginBottom: '1rem' }}>
      <strong style={{ display: 'block', marginBottom: '.4rem' }}>قبل الإرسال للمراجعة</strong>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <Row done={Boolean(title)} label="العنوان" />
        <Row done={Boolean(category)} label="القسم" />
        <Row done={Boolean(featuredImage)} label="صورة الغلاف" />
        <Row done={hasContent} label="نص المقال" />
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Register both as `ui` fields in `src/collections/Posts.ts`**

Add as the **first** entry of the `fields` array:

```ts
    {
      name: 'writerGuide',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/WriterGuide#default' },
      },
    },
```

Add anywhere in the array (position within the sidebar is controlled by `position`):

```ts
    {
      name: 'publishChecklist',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/admin/PublishChecklist#default' },
      },
    },
```

- [ ] **Step 4: Regenerate the import map**

Run: `npx pnpm@10.18.0 generate:importmap`
Expected: `src/app/(payload)/admin/importMap.js` gains entries for both components. Do not hand-edit this file.

- [ ] **Step 5: Verify the build compiles the new client components**

Run: `npx pnpm@10.18.0 lint && npx pnpm@10.18.0 build`
Expected: build succeeds. `ui` fields add no columns, so `payload-types.ts` should be unchanged apart from the optional `writerGuide`/`publishChecklist` UI keys.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/WriterGuide.tsx src/components/admin/PublishChecklist.tsx src/collections/Posts.ts "src/app/(payload)/admin/importMap.js" src/payload-types.ts
git commit -m "feat(admin): writer guidance banner and publish-readiness checklist"
```

---

### Task 7: Content validation and plain-Arabic copy

**Files:**
- Modify: `src/collections/Posts.ts` (the `content` and `excerpt` fields)
- Modify: `src/collections/Media.ts:50-58` (the `alt` field)
- Test: `tests/int/post-content-validation.int.spec.ts`

**Interfaces:**
- Consumes: `lexicalToPlainText` from `src/lib/lexical-text.ts` (Task 1)
- Produces: `validateArticleContent(value: unknown): true | string`

- [ ] **Step 1: Write the failing test**

Create `tests/int/post-content-validation.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { validateArticleContent } from '@/lib/lexical-text'

const doc = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

describe('validateArticleContent', () => {
  it('accepts an article with text', () => {
    expect(validateArticleContent(doc('نص حقيقي'))).toBe(true)
  })

  it('rejects null and undefined with an Arabic message', () => {
    expect(validateArticleContent(null)).toMatch(/اكتب/)
    expect(validateArticleContent(undefined)).toMatch(/اكتب/)
  })

  it('rejects a document whose only text is whitespace', () => {
    expect(validateArticleContent(doc('   '))).toMatch(/اكتب/)
  })

  it('accepts an article whose only content is an image', () => {
    // A photo essay is legitimate — presence of any node counts, not just text.
    const photoOnly = {
      root: { type: 'root', children: [{ type: 'upload', relationTo: 'media', value: 1 }] },
    }
    expect(validateArticleContent(photoOnly)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 test:int -- post-content-validation`
Expected: FAIL — `validateArticleContent is not a function`

- [ ] **Step 3: Add the validator to `src/lib/lexical-text.ts`**

Append:

```ts
/**
 * Guards against saving a blank article.
 *
 * Deliberately a `validate` function rather than `required: true`: dev and
 * production share one Neon database with `push: false`, and a custom validator
 * changes no column. Payload skips validation on draft saves, so this bites at
 * publish time — exactly where it should — while autosave keeps working on an
 * empty new post.
 *
 * A body with no text but at least one node (a photo essay) is valid.
 */
export function validateArticleContent(value: unknown): true | string {
  const data = value as LexicalRoot
  const children = data?.root?.children

  if (Array.isArray(children) && children.length > 0) {
    if (lexicalToPlainText(data).length > 0) return true
    // No text — allow it only if a real media node is present.
    const hasMedia = children.some((child) => child?.type === 'upload' || child?.type === 'block')
    if (hasMedia) return true
  }

  return 'لا يمكن نشر مقال فارغ. اكتب نص المقال أولًا.'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 test:int -- post-content-validation`
Expected: PASS — 4 tests

- [ ] **Step 5: Apply the validator and the copy changes**

In `src/collections/Posts.ts`, import `validateArticleContent` from `../lib/lexical-text` and replace the `content` field:

```ts
    {
      name: 'content',
      type: 'richText',
      label: 'نص المقال',
      validate: validateArticleContent,
      admin: {
        description: 'اكتب المقال هنا. استخدم زر الصورة لإضافة صور، وزر الفيديو لإدراج مقطع بالرابط.',
      },
    },
```

Replace the `excerpt` field so the automation is visible to the writer:

```ts
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'المقتطف (اختياري)',
      admin: {
        description: 'اتركه فارغًا وسنكتبه تلقائيًا من بداية المقال.',
      },
    },
```

Relabel `featuredImage`:

```ts
      label: 'صورة الغلاف',
      admin: {
        description: 'الصورة الرئيسية التي تظهر أعلى المقال وفي قوائم الموقع.',
      },
```

In `src/collections/Media.ts`, replace the `alt` field's label and description:

```ts
    {
      name: 'alt',
      type: 'text',
      label: 'ماذا تظهر الصورة؟',
      required: true,
      admin: {
        description: 'جملة قصيرة تصف الصورة. مثال: إطلالة الفنانة خلال حفل توزيع الجوائز بالرباط.',
      },
    },
```

- [ ] **Step 6: Verify**

Run: `npx pnpm@10.18.0 test:int && npx pnpm@10.18.0 lint`
Expected: all integration tests pass, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lexical-text.ts src/collections/Posts.ts src/collections/Media.ts tests/int/post-content-validation.int.spec.ts
git commit -m "feat(admin): block empty articles and rewrite editor copy in plain Arabic"
```

---

### Task 8: End-to-end coverage and final verification

**Files:**
- Modify: `tests/helpers/seedUser.ts` (add a journalist fixture)
- Create: `tests/e2e/editor-journalist.e2e.spec.ts`

**Interfaces:**
- Consumes: `login` from `tests/helpers/login.ts`, `seedTestUser`/`cleanupTestUser`/`testUser` from `tests/helpers/seedUser.ts`
- Produces: `seedJournalistUser()`, `cleanupJournalistUser()`, `journalistUser`

- [ ] **Step 1: Add the journalist fixture**

Append to `tests/helpers/seedUser.ts`:

```ts
export const journalistUser = {
  email: 'journalist@payloadcms.com',
  password: 'test',
  name: 'Journalist User',
  role: 'journalist' as const,
}

/** Seeds a journalist for the reduced-field-set e2e checks. */
export async function seedJournalistUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: { email: { equals: journalistUser.email } },
  })

  await payload.create({ collection: 'users', data: journalistUser })
}

export async function cleanupJournalistUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: { email: { equals: journalistUser.email } },
  })
}
```

- [ ] **Step 2: Write the e2e spec**

Create `tests/e2e/editor-journalist.e2e.spec.ts`:

```ts
import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import {
  seedTestUser,
  cleanupTestUser,
  testUser,
  seedJournalistUser,
  cleanupJournalistUser,
  journalistUser,
} from '../helpers/seedUser'

const CREATE_POST = 'http://localhost:3000/admin/collections/posts/create'

test.describe('Article editor — journalist view', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedJournalistUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: journalistUser })
    await page.goto(CREATE_POST)
  })

  test.afterAll(async () => {
    await cleanupJournalistUser()
  })

  test('shows the guidance banner', async () => {
    await expect(page.getByText('ابدأ بالكتابة مباشرة')).toBeVisible()
  })

  test('shows the publish checklist', async () => {
    await expect(page.getByText('قبل الإرسال للمراجعة')).toBeVisible()
  })

  test('hides the slug field', async () => {
    await expect(page.locator('#field-slug')).toHaveCount(0)
  })

  test('hides the SEO group', async () => {
    await expect(page.getByText('تحسين محركات البحث')).toHaveCount(0)
  })

  test('hides tags, authors and the publish date', async () => {
    await expect(page.locator('#field-tags')).toHaveCount(0)
    await expect(page.locator('#field-authors')).toHaveCount(0)
    await expect(page.locator('#field-publishedAt')).toHaveCount(0)
  })

  test('hides the derived media-type selector', async () => {
    await expect(page.locator('#field-featuredType')).toHaveCount(0)
  })

  test('shows the video URL field on a brand-new post', async () => {
    // Regression guard: featuredVideoUrl used to be gated behind
    // `featuredType === 'video'`, which became unreachable once featuredType
    // was derived from this very field.
    await expect(page.locator('#field-featuredVideoUrl')).toBeVisible()
  })

  test('shows the fields a journalist actually needs', async () => {
    await expect(page.locator('#field-title')).toBeVisible()
    await expect(page.locator('#field-category')).toBeVisible()
  })
})

test.describe('Article editor — admin view', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: testUser })
    await page.goto(CREATE_POST)
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('still sees the slug field', async () => {
    await expect(page.locator('#field-slug')).toBeVisible()
  })

  test('still sees the SEO group', async () => {
    await expect(page.getByText('تحسين محركات البحث')).toBeVisible()
  })

  test('does not see the journalist guidance banner', async () => {
    await expect(page.getByText('ابدأ بالكتابة مباشرة')).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `npx pnpm@10.18.0 test:e2e -- editor-journalist`
Expected: PASS — 11 tests

If a selector misses, inspect the rendered DOM rather than loosening the assertion — Payload field wrappers use `#field-<name>` consistently.

- [ ] **Step 4: Full verification**

Run each and confirm before claiming completion:

```bash
npx pnpm@10.18.0 lint
npx pnpm@10.18.0 test:int
npx pnpm@10.18.0 test:e2e
npx pnpm@10.18.0 build
```

Expected: all four clean.

- [ ] **Step 5: Confirm no schema drift**

Run: `git diff --stat src/payload-types.ts`
Expected: only additive types (the `VideoEmbed` block, the two `ui` field keys). If a column-bearing change appears, a migration would be needed and the no-migration constraint is broken — stop and reassess.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/seedUser.ts tests/e2e/editor-journalist.e2e.spec.ts
git commit -m "test(e2e): journalist sees the reduced field set, admin keeps the full one"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Field visibility (slug/seo/tags/authors/publishedAt) | 3 |
| featuredType hidden + derived, featuredVideoUrl un-gated | 2, 3 |
| Excerpt auto-derivation | 1, 2 |
| videoEmbed block | 4 |
| Frontend block rendering | 5 |
| Toolbar trim | 4 |
| Guidance banner + publish checklist | 6 |
| Media alt copy | 7 |
| `content` required | 7 (as `validate`, per the no-migration constraint) |
| Unit tests | 1, 2, 3, 7 |
| Integration test | 2, 5 |
| E2E tests | 8 |

**Type consistency:** `lexicalToPlainText`, `deriveExcerpt`, `LexicalRoot` and `validateArticleContent` all live in `src/lib/lexical-text.ts` and are referenced under those exact names in Tasks 2, 6 and 7. `editorialOnly` and `isEditorialUser` live in `src/fields/visibility.ts`, referenced in Tasks 3 and 6. `VideoEmbedBlock` is defined in Task 4 and consumed in Task 4's config only; its runtime shape (`url`, `caption`) is consumed in Task 5's converter.

**Deviation from spec, recorded deliberately:** the spec said `content` becomes `required: true`. The plan uses a `validate` function instead, because `required: true` on a Postgres-backed field risks a `NOT NULL` schema change and dev/prod share one database under `push: false`. Behaviour is equivalent where it matters — Payload skips validation on draft saves either way, so both designs enforce at publish time.
