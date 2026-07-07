# Meilisearch Search (env-gated inert) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a server-side `/search?q=` page over articles backed by Meilisearch, built entirely env-gated inert (no credentials → safe no-ops, graceful UI, clean build) so it activates later with no code change.

**Architecture:** One provider module (`src/lib/search.ts`) owns all Meilisearch contact behind `searchEnabled()`; a lazily-created client means importing it never connects. An index-on-publish hook mirrors the existing revalidate hooks. The `/search` server page reads `?q=`, calls the provider for post ids, fetches those published posts (order-preserving), and renders existing `PostCard`s — or a graceful disabled/empty/no-results state. A backfill script reindexes when credentials land.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), Payload CMS 3.85 (Local API + collection hooks), `meilisearch` JS SDK, Vitest (int), Playwright (e2e), Tailwind v4.

## Global Constraints

Every task's requirements implicitly include these (copied from the approved spec):

- **Env-gated inert is the contract.** With `MEILISEARCH_HOST` and/or `MEILISEARCH_API_KEY` unset, every provider function is a safe no-op (`indexPost`/`removePost`/`reindexAllPosts`) or returns empty (`searchPostIds` → `[]`, `reindexAllPosts` → `{ indexed: 0 }`), and **never throws**. The build, publishing, and `/search` all work without credentials.
- `searchEnabled()` ⇔ **both** env vars are non-empty. Enabled is the only path that instantiates the client or calls Meilisearch.
- Provider functions **never throw into callers**: Meilisearch errors are caught — `searchPostIds` degrades to `[]` (never a 500), `indexPost`/`removePost` swallow (a search outage must never block a publish).
- **No schema changes.** Posts already have `title`, `excerpt`, `slug`, `category`, `authors`, `publishedAt`.
- **Server-side only.** No client-side search code, no API route, no public search key — the single `MEILISEARCH_API_KEY` is used server-side and never reaches the browser.
- **Articles only** (the `posts` collection). Index name is `posts`.
- Search results reuse the existing **`PostCard`** (Cloudflare image loader — never `/_next/image`). RTL Arabic copy throughout.
- The `/search` page is **`noIndex`** and intentionally **dynamic (`ƒ`)**; it must not make the homepage or other static routes dynamic.
- pnpm is invoked as **`npx pnpm@10.18.0`** (the PATH pnpm is too old).

---

### Task 1: Meilisearch provider + dependency + inert unit tests

**Files:**
- Modify: `package.json` (add the `meilisearch` dependency)
- Create: `src/lib/search.ts`
- Test: `tests/int/search.int.spec.ts`

**Interfaces:**
- Consumes: `getPayloadClient` from `@/lib/payload`; `Post` from `@/payload-types`.
- Produces (used by later tasks):
  - `searchEnabled(): boolean`
  - `searchPostIds(query: string, limit?: number): Promise<number[]>`
  - `indexPost(post: Post): Promise<void>`
  - `removePost(id: number): Promise<void>`
  - `reindexAllPosts(): Promise<{ indexed: number }>`
  - `POSTS_INDEX` (string const), `SearchDoc` (type)

- [ ] **Step 1: Install the Meilisearch SDK**

Run: `npx pnpm@10.18.0 add meilisearch`
Expected: `package.json` gains `"meilisearch"` under `dependencies`; lockfile updates; install succeeds.

Note: the code below uses the long-stable meilisearch-js client surface (`new MeiliSearch({ host, apiKey })`, `client.index(name)`, `index.search`, `index.addDocuments`, `index.deleteDocument`, `index.updateSettings`). If the installed major version's types differ, adapt the call sites to the installed API while preserving the exact behavior described here.

- [ ] **Step 2: Write the failing test**

Create `tests/int/search.int.spec.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'

import { indexPost, removePost, searchEnabled, searchPostIds } from '@/lib/search'
import type { Post } from '@/payload-types'

// This suite runs WITHOUT Meilisearch credentials, verifying the inert contract:
// the provider is a safe no-op / empty and never throws when disabled.
describe('search provider (inert without credentials)', () => {
  beforeAll(() => {
    // Hermetic: guarantee "disabled" regardless of the ambient environment.
    delete process.env.MEILISEARCH_HOST
    delete process.env.MEILISEARCH_API_KEY
  })

  it('is disabled when the env vars are absent', () => {
    expect(searchEnabled()).toBe(false)
  })

  it('searchPostIds returns [] when disabled', async () => {
    await expect(searchPostIds('فستان')).resolves.toEqual([])
  })

  it('searchPostIds returns [] for a blank query', async () => {
    await expect(searchPostIds('   ')).resolves.toEqual([])
  })

  it('indexPost is a no-op that never throws when disabled', async () => {
    const post = { id: 1, title: 'عنوان', _status: 'published' } as unknown as Post
    await expect(indexPost(post)).resolves.toBeUndefined()
  })

  it('removePost is a no-op that never throws when disabled', async () => {
    await expect(removePost(1)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: FAIL — cannot resolve `@/lib/search` (module not yet created).

- [ ] **Step 4: Implement the provider**

Create `src/lib/search.ts`:

```ts
import { MeiliSearch, type Index } from 'meilisearch'

import type { Post } from '@/payload-types'
import { getPayloadClient } from './payload'

export const POSTS_INDEX = 'posts'

export type SearchDoc = {
  id: number
  title: string
  excerpt?: string
  categoryName?: string
  authorNames?: string
  slug?: string
  publishedAt?: string
}

/** Search is enabled only when BOTH Meilisearch credentials are present. */
export function searchEnabled(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)
}

// Lazily-created client — importing this module never connects. The client is
// instantiated the first time an enabled code path needs it.
let client: MeiliSearch | null = null

function getIndex(): Index | null {
  if (!searchEnabled()) return null
  if (!client) {
    client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST as string,
      apiKey: process.env.MEILISEARCH_API_KEY as string,
    })
  }
  return client.index(POSTS_INDEX)
}

/** Map a depth:1 Post → the lightweight searchable document. */
function toDoc(post: Post): SearchDoc {
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const authorNames = (post.authors ?? [])
    .map((a) => (a && typeof a === 'object' ? a.name : null))
    .filter((n): n is string => Boolean(n))
    .join(' ')
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt ?? undefined,
    categoryName: category?.name ?? undefined,
    authorNames: authorNames || undefined,
    slug: post.slug ?? undefined,
    publishedAt: post.publishedAt ?? undefined,
  }
}

/**
 * Post ids matching `query`, in Meilisearch relevance order.
 * Returns [] when disabled, when the query is blank, or on any Meilisearch error
 * (a search outage degrades to "no results", never a 500).
 */
export async function searchPostIds(query: string, limit = 24): Promise<number[]> {
  const q = query.trim()
  const index = getIndex()
  if (!index || !q) return []
  try {
    const res = await index.search<SearchDoc>(q, { limit, attributesToRetrieve: ['id'] })
    return res.hits.map((h) => h.id)
  } catch {
    return []
  }
}

/**
 * Upsert (published) or remove (draft/unpublished) one post in the index.
 * No-op when disabled. Never throws — a Meilisearch outage must not block a publish.
 */
export async function indexPost(post: Post): Promise<void> {
  const index = getIndex()
  if (!index) return
  try {
    if (post._status === 'published') {
      await index.addDocuments([toDoc(post)], { primaryKey: 'id' })
    } else {
      await index.deleteDocument(post.id)
    }
  } catch {
    /* indexing must never break publishing */
  }
}

/** Remove one post from the index. No-op when disabled; never throws. */
export async function removePost(id: number): Promise<void> {
  const index = getIndex()
  if (!index) return
  try {
    await index.deleteDocument(id)
  } catch {
    /* ignore */
  }
}

/**
 * Backfill: (re)configure index settings and index every published post.
 * Returns { indexed: 0 } when disabled. Used by src/seed/reindex.ts.
 */
export async function reindexAllPosts(): Promise<{ indexed: number }> {
  const index = getIndex()
  if (!index) return { indexed: 0 }

  await index.updateSettings({
    searchableAttributes: ['title', 'excerpt', 'categoryName', 'authorNames'],
    displayedAttributes: ['id'],
  })

  const payload = await getPayloadClient()
  let page = 1
  let indexed = 0
  for (;;) {
    const { docs, hasNextPage } = await payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      depth: 1,
      limit: 100,
      page,
    })
    if (docs.length) {
      await index.addDocuments(docs.map(toDoc), { primaryKey: 'id' })
      indexed += docs.length
    }
    if (!hasNextPage) break
    page += 1
  }
  return { indexed }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/search.ts tests/int/search.int.spec.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/search.ts tests/int/search.int.spec.ts
git commit -m "feat(search): Meilisearch provider (env-gated inert) + unit tests"
```

---

### Task 2: Index-on-publish hook + wire into Posts

**Files:**
- Create: `src/hooks/searchIndex.ts`
- Modify: `src/collections/Posts.ts` (imports + `afterChange`/`afterDelete` arrays)
- Test: `tests/int/search.int.spec.ts` (append a hook block)

**Interfaces:**
- Consumes: `indexPost`, `removePost` from `@/lib/search` (Task 1); `Post` from `@/payload-types`; `CollectionAfterChangeHook`, `CollectionAfterDeleteHook` from `payload`.
- Produces: `searchIndexAfterChange`, `searchIndexAfterDelete` (added to the Posts hooks arrays alongside the existing `revalidate*` hooks).

- [ ] **Step 1: Write the failing test**

In `tests/int/search.int.spec.ts`, add this import to the **top import group** (keep all imports at the top so `import/first` stays satisfied):

```ts
import { searchIndexAfterChange, searchIndexAfterDelete } from '@/hooks/searchIndex'
```

Then append this `describe` block at the **end** of the file:

```ts
describe('search index hooks (inert without credentials)', () => {
  it('afterChange returns the doc unchanged and never throws when disabled', async () => {
    const doc = { id: 1, title: 'عنوان', _status: 'published' }
    // The hook only reads `doc`; other hook args are irrelevant here.
    const result = await searchIndexAfterChange({ doc } as never)
    expect(result).toBe(doc)
  })

  it('afterDelete returns the doc unchanged and never throws when disabled', async () => {
    const doc = { id: 1, title: 'عنوان' }
    const result = await searchIndexAfterDelete({ doc } as never)
    expect(result).toBe(doc)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: FAIL — cannot resolve `@/hooks/searchIndex`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/searchIndex.ts`:

```ts
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '@/payload-types'
import { indexPost, removePost } from '@/lib/search'

/**
 * Keep the Meilisearch index in step with Posts. Both are no-ops when search is
 * disabled (no credentials), and indexPost/removePost swallow errors, so a search
 * outage never blocks a publish. Mirrors src/hooks/revalidate.ts.
 */
export const searchIndexAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await indexPost(doc as Post)
  return doc
}

export const searchIndexAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await removePost((doc as Post).id)
  return doc
}
```

- [ ] **Step 4: Wire the hook into Posts**

In `src/collections/Posts.ts`, add the import next to the existing revalidate import (after line 12):

```ts
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { searchIndexAfterChange, searchIndexAfterDelete } from '../hooks/searchIndex'
```

Then change the `afterChange`/`afterDelete` arrays (currently lines 57-58) to:

```ts
    afterChange: [revalidateAfterChange, searchIndexAfterChange],
    afterDelete: [revalidateAfterDelete, searchIndexAfterDelete],
```

Leave `beforeChange` untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: PASS (7/7 — the 5 provider tests plus the 2 hook tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/hooks/searchIndex.ts src/collections/Posts.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/searchIndex.ts src/collections/Posts.ts tests/int/search.int.spec.ts
git commit -m "feat(search): index posts on publish/delete via Payload hooks"
```

---

### Task 3: `getPostsByIds` query + `/search` page

**Files:**
- Modify: `src/lib/queries.ts` (add `getPostsByIds`)
- Create: `src/app/(frontend)/search/page.tsx`
- Test: `tests/int/search.int.spec.ts` (append `getPostsByIds([])` case)

**Interfaces:**
- Consumes: `searchEnabled`, `searchPostIds` from `@/lib/search` (Task 1); `getPostsByIds` (this task); `PostCard` from `@/components/PostCard`; `buildMetadata` from `@/lib/seo`; the `PUBLISHED` where-constant + `getPayloadClient` already in `queries.ts`.
- Produces: `getPostsByIds(ids: number[]): Promise<Post[]>` (published-only, order-preserving); the `/search` route.

- [ ] **Step 1: Write the failing test**

In `tests/int/search.int.spec.ts`, add this import to the **top import group**:

```ts
import { getPostsByIds } from '@/lib/queries'
```

Then append this `describe` block at the **end** of the file:

```ts
describe('getPostsByIds', () => {
  it('returns [] for empty input without touching the DB', async () => {
    await expect(getPostsByIds([])).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: FAIL — `getPostsByIds` is not exported from `@/lib/queries`.

- [ ] **Step 3: Implement `getPostsByIds`**

In `src/lib/queries.ts`, add (near the other post queries, e.g. after `getPostsByAuthor`):

```ts
/**
 * Published posts for the given ids, returned in the SAME order as `ids`.
 * Postgres `IN` doesn't preserve order, but Meilisearch relevance ranking must
 * survive the fetch — so we re-sort by the input order. Empty input → [] (no query).
 */
export async function getPostsByIds(ids: number[]): Promise<Post[]> {
  if (!ids.length) return []
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    where: { and: [PUBLISHED, { id: { in: ids } }] },
    depth: 1,
    limit: ids.length,
  })
  const order = new Map(ids.map((id, i) => [id, i]))
  return [...docs].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run tests/int/search.int.spec.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Implement the search page**

Create `src/app/(frontend)/search/page.tsx`:

```tsx
import type { Metadata } from 'next'

import { PostCard } from '@/components/PostCard'
import { getPostsByIds } from '@/lib/queries'
import { searchEnabled, searchPostIds } from '@/lib/search'
import { buildMetadata } from '@/lib/seo'

type SearchParams = Promise<{ q?: string }>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const { q } = await searchParams
  const query = q?.trim() ?? ''
  return buildMetadata({
    title: query ? `بحث: ${query}` : 'بحث',
    path: '/search',
    noIndex: true,
  })
}

function SearchForm({ q }: { q: string }) {
  return (
    <form action="/search" method="get" role="search" className="mx-auto flex max-w-xl gap-2">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="ابحث في المقالات…"
        aria-label="بحث"
        className="flex-1 rounded-full border border-zinc-300 px-5 py-3 text-zinc-900 outline-none focus:border-brand-500"
      />
      <button
        type="submit"
        className="rounded-full bg-brand-600 px-6 py-3 font-bold text-white transition-colors hover:bg-brand-700"
      >
        بحث
      </button>
    </form>
  )
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  const enabled = searchEnabled()
  const ids = enabled && query ? await searchPostIds(query) : []
  const posts = ids.length ? await getPostsByIds(ids) : []

  return (
    <div className="lf-container py-10">
      <h1 className="mb-6 text-center text-3xl font-bold text-zinc-900">البحث</h1>
      <SearchForm q={query} />

      <div className="mt-10">
        {!enabled ? (
          <p className="text-center text-zinc-500">البحث سيتوفر قريبًا.</p>
        ) : !query ? (
          <p className="text-center text-zinc-500">اكتب كلمة للبحث في المقالات.</p>
        ) : posts.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-center text-zinc-500">لا توجد نتائج لـ «{query}».</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/queries.ts "src/app/(frontend)/search/page.tsx"`
Expected: no errors.

- [ ] **Step 7: Build and confirm route rendering modes**

Run: `npx pnpm@10.18.0 exec next build`
Expected: build succeeds; in the route table `/search` is dynamic (`ƒ`) and `/` (homepage) remains static (`○`). If `/search` is not `ƒ`, that's a defect — reading awaited `searchParams` must keep it dynamic.

- [ ] **Step 8: Commit**

```bash
git add src/lib/queries.ts "src/app/(frontend)/search/page.tsx" tests/int/search.int.spec.ts
git commit -m "feat(search): /search page + order-preserving getPostsByIds query"
```

---

### Task 4: Backfill script + `.env.example` + e2e

**Files:**
- Create: `src/seed/reindex.ts`
- Modify: `.env.example` (comment on the two reserved Meilisearch vars)
- Test: `tests/e2e/search.e2e.spec.ts`

**Interfaces:**
- Consumes: `reindexAllPosts`, `searchEnabled` from `@/lib/search` (Task 1). Script bootstrap mirrors `src/seed/index.ts` (`import 'dotenv/config'` + top-level `run().catch(process.exit)`).

- [ ] **Step 1: Implement the backfill script**

Create `src/seed/reindex.ts`:

```ts
import 'dotenv/config'

import { reindexAllPosts, searchEnabled } from '../lib/search'

/**
 * One-off Meilisearch backfill. Safe to run anytime: if search is disabled (no
 * credentials) it logs and exits 0 without doing anything. When credentials are
 * present it (re)configures the index and indexes every published post.
 *
 * Run: npx pnpm@10.18.0 exec tsx src/seed/reindex.ts
 */
async function run() {
  if (!searchEnabled()) {
    console.log('Search disabled — set MEILISEARCH_HOST + MEILISEARCH_API_KEY to enable, then rerun.')
    process.exit(0)
  }
  const { indexed } = await reindexAllPosts()
  console.log(`Reindexed ${indexed} published post(s) into Meilisearch.`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Verify the script runs inert (no credentials)**

Run: `npx pnpm@10.18.0 exec tsx src/seed/reindex.ts`
Expected: prints `Search disabled — set MEILISEARCH_HOST + MEILISEARCH_API_KEY to enable, then rerun.` and exits 0 (no Meilisearch connection attempted).

- [ ] **Step 3: Document the env vars**

In `.env.example`, under the `# ── Phase 6: integrations ──` block, add a comment line directly above the two Meilisearch vars so it reads:

```
# ── Phase 6: integrations (filled in at their phase) ──
# Search (Meilisearch): set BOTH to enable /search; unset ⇒ search runs inert.
# MEILISEARCH_HOST=
# MEILISEARCH_API_KEY=
# BREVO_API_KEY=
# BREVO_LIST_ID=
# ONESIGNAL_APP_ID=
# ONESIGNAL_REST_API_KEY=
```

- [ ] **Step 4: Write the e2e spec**

Create `tests/e2e/search.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// e2e runs inert (no Meilisearch credentials): the page must render the form and
// the graceful "coming soon" state, and the GET form must navigate to /search?q=.
test.describe('Search', () => {
  test('renders the search form and the disabled notice', async ({ page }) => {
    await page.goto(`${BASE}/search`)

    const input = page.getByRole('searchbox', { name: 'بحث' })
    await expect(input).toBeVisible()
    await expect(page.getByText('البحث سيتوفر قريبًا.')).toBeVisible()
  })

  test('submitting a query navigates to /search?q= and stays graceful', async ({ page }) => {
    await page.goto(`${BASE}/search`)

    const input = page.getByRole('searchbox', { name: 'بحث' })
    await input.fill('فستان')
    await input.press('Enter')

    await expect(page).toHaveURL(/\/search\?q=/)
    await expect(page.getByText('البحث سيتوفر قريبًا.')).toBeVisible()
  })
})
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/seed/reindex.ts tests/e2e/search.e2e.spec.ts`
Expected: no errors.

- [ ] **Step 6: Run the e2e (controller runs this)**

The controller starts a dev server on port 3000 and runs:
`npx pnpm@10.18.0 exec playwright test tests/e2e/search.e2e.spec.ts`
Expected: 2/2 pass — the form + disabled notice render, and Enter-submit lands on `/search?q=فستان` still showing the graceful notice.

- [ ] **Step 7: Commit**

```bash
git add src/seed/reindex.ts .env.example tests/e2e/search.e2e.spec.ts
git commit -m "feat(search): backfill script, env docs, and /search e2e"
```

---

## Verification (whole feature, inert)

- `npx pnpm@10.18.0 exec tsc --noEmit` + `eslint .` + `next build` all clean.
- `/search` builds as dynamic (`ƒ`); homepage and other static routes unchanged (`○`).
- Vitest: `tests/int/search.int.spec.ts` green (provider inert contract, hook no-op, `getPostsByIds([])`).
- Playwright: `tests/e2e/search.e2e.spec.ts` green (form + disabled state + GET navigation).
- Backfill script runs inert (logs + exits 0) with no credentials.
- No `/_next/image` introduced (results reuse `PostCard`).

## Activation (later — out of this plan's automated run)

When the user provides Meilisearch credentials: set `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY`, run `npx pnpm@10.18.0 exec tsx src/seed/reindex.ts` to backfill, and search activates — new/edited publishes auto-index via the hook, `/search?q=` returns `PostCard` results.

### ⚠ Activation blocker (fix BEFORE setting credentials) — autosave evicts published posts

The final whole-branch review (opus, traced against Payload 3.85's `update.js`) confirmed a **dormant enabled-path bug**: Posts have `versions.drafts.autosave: { interval: 375 }`. When an editor edits an **already-published** post, each ~375ms autosave calls the update op with `draft: true`, and Payload forces `data._status = 'draft'` on the autosaved doc (`isSavingDraft = draftArg && draftsEnabled && data._status !== 'published'`). The `afterChange` hook therefore receives `doc._status === 'draft'`, so `indexPost` takes the delete branch and **removes the still-live post from the Meilisearch index** mid-edit. The article stays live on the site (published version untouched) but silently vanishes from `/search` until the next explicit **Publish** (re-adds it) or the next backfill.

**Dormant while inert:** with no credentials, `getIndex()` returns `null` and `indexPost` returns before reading `_status`, so this cannot fire today. It only matters once `MEILISEARCH_*` are set.

**Fix at activation (cheapest first):**
- In `searchIndexAfterChange`, use the hook's `previousDoc`/`operation`/autosave context to skip eviction during autosave; **or**
- In `indexPost` (widen its signature to take the transition), only `deleteDocument` on a genuine unpublish (`previousDoc._status === 'published' && doc._status !== 'published'` and not an autosave) — treat "draft that was never published" as a no-op; **or**
- Before deleting, check whether a published version of the doc still exists and skip the delete if so.

**Add a regression test** (runs only with a live Meilisearch instance): "autosaving an already-published post leaves it in the index." The `afterDelete` path (real deletes) is correct and unaffected.

---
*Plan for: docs/superpowers/specs/2026-07-07-phase-6-meilisearch-search-design.md*
*Phase: 06-meilisearch-search*
