# Phase 6 (sub-project 3) — Meilisearch Search (env-gated inert) — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-07
**Status:** Approved — ready for implementation plan.

## Goal

Give the site a working **`/search`** page (the Header search icon already links there) backed by
**Meilisearch** — indexing **articles** (Posts) and rendering matches as `PostCard`s. The whole feature
is **built env-gated inert**: with no `MEILISEARCH_*` credentials the code ships, builds, publishes, and
serves `/search` (showing a graceful "coming soon" state) without ever contacting Meilisearch. When the
user later adds credentials and runs a one-off backfill, search activates **with no code change**.

This is sub-project 3 of Phase 6 (siblings: magazine archive [done], per-video watch pages [done], Brevo
newsletter, OneSignal push). This spec covers **only** Meilisearch article search. **No schema changes.**

## Confirmed decisions

| Topic | Decision |
|---|---|
| Search UX | **Server-side `/search?q=`** — a server component with a GET `<form>`; submitting queries Meilisearch server-side and SSRs the results. Works without JS. No client search code, no API route. |
| Index scope | **Articles only** (Posts). One indexing hook, one result card type. Videos/magazine folded in later behind the same provider. |
| Activation model | **Env-gated inert.** `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` both present → enabled; otherwise every provider call is a safe no-op / empty. |
| Key model | **One admin/write key** (`MEILISEARCH_API_KEY`). Search runs server-side (SSR), so the key never reaches the browser — no separate public search key needed. |
| Result rendering | Search returns **post ids** (relevance order) → fetch the full published posts by id → render existing **`PostCard`s**. Reuses the card + Cloudflare image loader; one extra DB query per search. |
| Results indexing | **`noIndex`** on the `/search` page (search-result pages shouldn't be in Google's index). |
| Schema changes | **None.** Posts already have `title`, `excerpt`, `slug`, `category`, `authors`, `publishedAt`. |

## Current-state facts (verified against code)

- **No `/search` route** exists under `src/app/(frontend)`. **`Header.tsx:47`** already renders
  `<Link href="/search" aria-label="بحث">` with a `SearchIcon` — today it 404s; this spec answers it.
- **`meilisearch` is NOT in `package.json`** (needs install). **`tsx@4.21.0`** is present (dev dep) — the
  backfill script runs under it, like the other `src/seed/*` scripts.
- **`.env.example:31-32`** already reserves `# MEILISEARCH_HOST=` / `# MEILISEARCH_API_KEY=` (commented).
- **Posts hooks** (`src/collections/Posts.ts:57-58`): `afterChange: [revalidateAfterChange]`,
  `afterDelete: [revalidateAfterDelete]`. The revalidate hooks (`src/hooks/revalidate.ts`) are the pattern
  to mirror: `export const revalidateAfterChange: CollectionAfterChangeHook = ({ doc }) => { …; return doc }`.
- **`buildMetadata`** (`src/lib/seo.ts`) already accepts **`noIndex?: boolean`** → `robots {index:false,
  follow:false}`. No SEO helper changes needed.
- **`PostCard`** (`src/components/PostCard.tsx`) takes `{ post: Post; variant }`; `variant="default"` is the
  grid card (used on category/author pages). Reused verbatim for results.
- **Queries** (`src/lib/queries.ts`) use a `PUBLISHED` where-constant, `getPayloadClient()`, `depth:1`;
  `find({ where:{ and:[PUBLISHED, …] } })` is the published-only idiom. No `getPostsByIds` yet.
- Posts publish through the Payload admin (a Next route handler), so `afterChange`/`afterDelete` fire
  in-process there. Local API seed writes run outside a request scope (hooks must tolerate that — the
  revalidate hooks already do via try/catch).

## Architecture

### 1. Provider — `src/lib/search.ts` (new)

The single module that ever touches Meilisearch. Importing it never connects; the client is created lazily
on first real use, only when enabled.

- `searchEnabled(): boolean` — `Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)`.
- `POSTS_INDEX = 'posts'` and `type SearchDoc = { id: number; title: string; excerpt?: string;
  categoryName?: string; authorNames?: string; slug?: string; publishedAt?: string }`.
- Module-scoped lazy client: `let client: MeiliSearch | null`; a private `getIndex()` instantiates
  `new MeiliSearch({ host, apiKey })` on first call when enabled.
- `searchPostIds(query: string, limit = 24): Promise<number[]>` — returns matching post ids in Meilisearch
  relevance order. Returns `[]` when **disabled**, when `query` is blank, or on any Meilisearch error
  (try/catch → `[]`, so a search outage degrades to "no results", never a 500).
- `indexPost(post: Post): Promise<void>` — **no-op when disabled**. When enabled: if the post is
  `_status === 'published'` → upsert `toDoc(post)`; otherwise → delete it from the index (so unpublishing
  removes it). Wrapped in try/catch (a Meilisearch outage must **never** block a publish).
- `removePost(id: number): Promise<void>` — no-op when disabled; else delete the doc by id (try/catch).
- `reindexAllPosts(): Promise<{ indexed: number }>` — backfill: configure index settings, page through all
  published posts (Local API, `depth:1`), `addDocuments` in batches. Used by the script. `{ indexed: 0 }`
  when disabled.
- Private `toDoc(post)`: maps a `depth:1` post → `SearchDoc`. Guards relationship fields
  (`categoryName = typeof post.category === 'object' ? post.category.title : undefined`; `authorNames` =
  populated author names joined; both omitted when unpopulated). `title` + `excerpt` are always present, so
  search works even if a hook fires with shallow relations.
- Index settings (set in `reindexAllPosts`): `searchableAttributes: ['title','excerpt','categoryName',
  'authorNames']`, `displayedAttributes: ['id']` (only the id is read back). Meilisearch infers `id` as the
  primary key.

### 2. Indexing hook — `src/hooks/searchIndex.ts` (new)

Mirrors `revalidate.ts`:

- `searchIndexAfterChange: CollectionAfterChangeHook = async ({ doc }) => { await indexPost(doc as …Post); return doc }`
- `searchIndexAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => { await removePost(doc.id); return doc }`

Added to **Posts** alongside the existing hooks:
`afterChange: [revalidateAfterChange, searchIndexAfterChange]`,
`afterDelete: [revalidateAfterDelete, searchIndexAfterDelete]`. When disabled the awaited calls return
immediately — zero overhead, publishing unaffected.

### 3. Query — `src/lib/queries.ts`

- `getPostsByIds(ids: number[]): Promise<Post[]>` — `[]` for empty input; else published-only
  (`where:{ and:[PUBLISHED, { id:{ in: ids } }] }`, `depth:1`, `limit: ids.length`), then **re-sorted to
  match the `ids` order** so Meilisearch's relevance ranking is preserved (Postgres `IN` doesn't preserve
  order).

### 4. Search page — `src/app/(frontend)/search/page.tsx` (new)

Server component. `searchParams: Promise<{ q?: string }>` (Next 16 async) → `q = (…).q?.trim() ?? ''`.
Reading `searchParams` makes the route **dynamic (`ƒ`)** — no `revalidate`, no static caching (search is
inherently per-query).

Renders, in a `.lf-container`:
- A GET **search form** (always): `<form action="/search" method="get" role="search">` with
  `<input type="search" name="q" defaultValue={q}>` + a submit button. No JS needed — submitting navigates
  to `/search?q=…`.
- Then one of four states:
  - **Disabled** (`!searchEnabled()`): a graceful notice — **"البحث سيتوفر قريبًا."** (search coming soon).
  - **Empty `q`**: a hint — "اكتب كلمة للبحث في المقالات."
  - **Has results**: `ids = await searchPostIds(q)` → `posts = await getPostsByIds(ids)` → a grid
    (`grid gap-6 sm:grid-cols-2 lg:grid-cols-3`) of `<PostCard post={p} />`.
  - **No results**: "لا توجد نتائج لـ «{q}»."

`generateMetadata` → `buildMetadata({ title: q ? \`بحث: ${q}\` : 'بحث', path: '/search', noIndex: true })`.

### 5. Backfill script — `src/seed/reindex.ts` (new)

A one-off run for when credentials land (activation has no code change, only data): mirrors the existing
`src/seed/*` bootstrap, calls `reindexAllPosts()`, logs the count. If `!searchEnabled()` it logs
"set MEILISEARCH_HOST + MEILISEARCH_API_KEY" and exits 0 (so it's safe to run anytime).
Run: `npx pnpm@10.18.0 exec tsx src/seed/reindex.ts`.

### 6. Dependency + env

- Add **`meilisearch`** to `package.json` dependencies (imported in `lib/search.ts`; client only
  instantiated when enabled).
- `.env.example`: keep the two vars, add a one-line guiding comment (both required to enable search).

## Files

| File | Change |
|---|---|
| `src/lib/search.ts` | **New** — env-gate + provider (`searchEnabled`, `searchPostIds`, `indexPost`, `removePost`, `reindexAllPosts`, `toDoc`) |
| `src/hooks/searchIndex.ts` | **New** — `searchIndexAfterChange` / `searchIndexAfterDelete` |
| `src/collections/Posts.ts` | Add the two index hooks to the `afterChange`/`afterDelete` arrays |
| `src/lib/queries.ts` | + `getPostsByIds(ids)` (published, order-preserving) |
| `src/app/(frontend)/search/page.tsx` | **New** — `/search?q=` form + results + disabled/empty/no-results states + `noIndex` metadata |
| `src/seed/reindex.ts` | **New** — backfill script (for when creds land) |
| `package.json` | + `meilisearch` dependency |
| `.env.example` | Comment on the two reserved vars |
| `tests/int/search.int.spec.ts` | **New** — inert contract (no env, no DB): `searchEnabled()` false, `searchPostIds` `[]`, `indexPost`/`removePost` don't throw, `getPostsByIds([])` `[]` |
| `tests/e2e/search.e2e.spec.ts` | **New** — `/search` renders the form; submit → `?q=`; disabled/graceful state shown (e2e runs inert) |

## Verification

**Inert (no Meilisearch env — the state everything is verified in):**
- `tsc --noEmit` + `eslint .` + `pnpm build` clean; `/search` is dynamic (`ƒ`), homepage still static.
- Unit (Vitest): `searchEnabled()` → `false`; `searchPostIds('x')` → `[]`; `indexPost(fakePost)` /
  `removePost(1)` resolve without throwing; `getPostsByIds([])` → `[]`.
- Publishing a post through admin does **not** error (the awaited hook no-ops).
- Playwright (dev server, RTL, no creds): `/search` shows the form; typing a query + submit lands on
  `/search?q=…` and shows the "coming soon" notice; no crash; `/search` metadata is `noindex`.

**Activation (later, when the user provides creds — out of this sub-project's automated run):** set the two
env vars, `npx pnpm@10.18.0 exec tsx src/seed/reindex.ts` backfills; a new/edited publish auto-indexes via
the hook; `/search?q=` returns `PostCard` results. No code change.

## Out of scope (this sub-project)

- Indexing videos or magazine issues (same provider extends to them later — one `toDoc` + hook each).
- Client-side / instant-search UI, autocomplete, typo-tolerance tuning, faceting, pagination of results.
- A separate public (search-only) Meilisearch key — unneeded while search is server-side.
- Provisioning the Meilisearch instance / running the live backfill (credential-gated; user does this).
- Brevo newsletter / OneSignal push — separate Phase 6 sub-projects.

## Deferred ideas (noted, not lost)

- Fold videos + magazine issues into the index behind the same provider (multi-type results).
- Result pagination / "load more" if article volume makes a single page long.
- Meilisearch relevancy tuning (synonyms, stop-words, Arabic normalization) once real queries exist.

---
*Phase: 06-meilisearch-search*
*Design gathered: 2026-07-07*
