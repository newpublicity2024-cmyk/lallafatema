# Phase 8.1 — Legal & Static Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing Payload `pages` collection at clean top-level URLs, seed real Arabic draft content for five footer pages, and fix the consent-banner `/privacy` 404 — with no database schema change.

**Architecture:** Next.js App Router forbids two sibling dynamic segments, so the existing `src/app/(frontend)/[category]/page.tsx` becomes a dispatcher: resolve the slug as a category (existing behaviour) → else as a published page (`<PageView>`) → else `notFound()`. Pages are CMS-managed (`pages` collection, already has title/content/slug/seo). Content is seeded idempotently by slug through the existing seed script.

**Tech Stack:** Payload CMS 3.85, Next.js App Router (RSC), Lexical richText, Vitest (integration), Playwright (E2E), Tailwind (RTL `prose-ar`).

## Global Constraints

- **No schema change / no migration.** The `pages` collection already has every field needed (`title`, `content` richText, `slug`, `seo`). Do not add fields.
- **Arabic-first, RTL.** All user-facing copy is Arabic; rich text renders with `className="prose-ar"`.
- **Clean top-level URLs.** Pages live at `/<slug>` (e.g. `/privacy`), matching `FOOTER_PAGES` in `src/lib/site.ts` and the SiteSettings `privacyPolicyUrl` default `/privacy`. Do NOT introduce a URL prefix.
- **Exactly five pages, by slug:** `about`, `editorial-board`, `advertise`, `privacy`, `terms`. No `/cookies`, `/contact`, or contact form.
- **Published-only reads.** Page queries must exclude drafts (`_status: 'published'`).
- **Tooling:** run pnpm via `npx pnpm@10.18.0` (PATH pnpm is too old). Tests: `npx pnpm@10.18.0 run test:int` (vitest) and `npx pnpm@10.18.0 run test:e2e` (playwright, needs dev server on :3000). Seed: `npx pnpm@10.18.0 run seed`.
- **Legal copy is an AI-drafted placeholder** pending human review before launch (tracked in memory `review-legal-copy-before-launch`). Ship it, don't block on it.

## File Structure

- `src/lib/routes.ts` (modify) — add `pageUrl(slug)` and `pageShowsUpdatedDate(slug)` pure helpers.
- `src/lib/queries.ts` (modify) — add `getPageBySlug(slug)` and `getPublishedPages()` data-access functions.
- `src/components/PageView.tsx` (create) — presentational component rendering one page.
- `src/app/(frontend)/[category]/page.tsx` (modify) — dispatcher (category → page → 404) across default export, `generateMetadata`, `generateStaticParams`.
- `src/seed/index.ts` (modify) — add `richDoc(blocks)` Lexical helper, `SEED_PAGES`, and an idempotent-by-slug seeding loop.
- `src/app/(frontend)/sitemap.xml/route.ts` (modify) — include published pages.
- `tests/int/routes.int.spec.ts` (modify) — unit tests for the two route helpers.
- `tests/int/pages.int.spec.ts` (create) — DB tests for the two queries.
- `tests/e2e/pages.e2e.spec.ts` (create) — routing behaviour (`/privacy` 200, unknown 404, category unaffected, sitemap contains pages).

---

### Task 1: Route helpers (`pageUrl`, `pageShowsUpdatedDate`)

**Files:**
- Modify: `src/lib/routes.ts` (append after `videoWatchUrl`, end of file)
- Test: `tests/int/routes.int.spec.ts` (append)

**Interfaces:**
- Produces:
  - `pageUrl(slug: string): string` → `/<slug>`
  - `pageShowsUpdatedDate(slug: string): boolean` → true for `privacy`/`terms`, else false

- [ ] **Step 1: Write the failing tests**

Append to `tests/int/routes.int.spec.ts`:

```ts
import { pageUrl, pageShowsUpdatedDate } from '@/lib/routes'

describe('pageUrl', () => {
  it('builds a clean top-level url', () => {
    expect(pageUrl('about')).toBe('/about')
    expect(pageUrl('privacy')).toBe('/privacy')
  })
})

describe('pageShowsUpdatedDate', () => {
  it('is true for legal pages', () => {
    expect(pageShowsUpdatedDate('privacy')).toBe(true)
    expect(pageShowsUpdatedDate('terms')).toBe(true)
  })
  it('is false for other pages', () => {
    expect(pageShowsUpdatedDate('about')).toBe(false)
    expect(pageShowsUpdatedDate('advertise')).toBe(false)
    expect(pageShowsUpdatedDate('')).toBe(false)
  })
})
```

(The file already imports from `@/lib/routes` at the top; adding a second `import` line for the new symbols is fine, or extend the existing import. `describe`/`it`/`expect` are already imported.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/routes.int.spec.ts`
Expected: FAIL — `pageUrl is not a function` / `pageShowsUpdatedDate is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/routes.ts`:

```ts
/** Static/legal page permalink — a clean top-level URL (e.g. /privacy). */
export function pageUrl(slug: string): string {
  return `/${slug}`
}

/** Pages that display a "last updated" line (legal pages where recency matters). */
const PAGES_WITH_UPDATED_DATE = new Set(['privacy', 'terms'])

export function pageShowsUpdatedDate(slug: string): boolean {
  return PAGES_WITH_UPDATED_DATE.has(slug)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/routes.int.spec.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/routes.ts tests/int/routes.int.spec.ts
git commit -m "feat(pages): add pageUrl + pageShowsUpdatedDate route helpers"
```

---

### Task 2: Page queries (`getPageBySlug`, `getPublishedPages`)

**Files:**
- Modify: `src/lib/queries.ts` (add `Page` to the `@/payload-types` import; append the two functions)
- Test: `tests/int/pages.int.spec.ts` (create)

**Interfaces:**
- Consumes: `getPayloadClient` (already imported in `queries.ts`), `Page` type from `@/payload-types`.
- Produces:
  - `getPageBySlug(slug: string): Promise<Page | null>` — one **published** page by slug, else null.
  - `getPublishedPages(): Promise<Pick<Page, 'slug' | 'updatedAt'>[]>` — all published pages (slug + updatedAt), for sitemap and static params.

- [ ] **Step 1: Write the failing tests**

Create `tests/int/pages.int.spec.ts`:

```ts
import { getPayload, Payload } from 'payload'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import config from '@/payload.config'
import { getPageBySlug, getPublishedPages } from '@/lib/queries'

let payload: Payload
const PUB_SLUG = 'test-page-pub-8a1'
const DRAFT_SLUG = 'test-page-draft-8a1'
let pubId: number | string
let draftId: number | string

describe('page queries', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const pub = await payload.create({
      collection: 'pages',
      data: { title: 'صفحة منشورة للاختبار', slug: PUB_SLUG, _status: 'published' },
    })
    pubId = pub.id
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'صفحة مسودة للاختبار', slug: DRAFT_SLUG, _status: 'draft' },
    })
    draftId = draft.id
  })

  afterAll(async () => {
    await payload.delete({ collection: 'pages', id: pubId })
    await payload.delete({ collection: 'pages', id: draftId })
  })

  it('returns a published page by slug', async () => {
    const page = await getPageBySlug(PUB_SLUG)
    expect(page?.slug).toBe(PUB_SLUG)
  })

  it('returns null for an unknown slug', async () => {
    expect(await getPageBySlug('no-such-page-zzz-8a1')).toBeNull()
  })

  it('returns null for a draft (unpublished) page', async () => {
    expect(await getPageBySlug(DRAFT_SLUG)).toBeNull()
  })

  it('getPublishedPages includes the published page, excludes the draft', async () => {
    const slugs = (await getPublishedPages()).map((p) => p.slug)
    expect(slugs).toContain(PUB_SLUG)
    expect(slugs).not.toContain(DRAFT_SLUG)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/pages.int.spec.ts`
Expected: FAIL — `getPageBySlug is not a function` (import resolves to undefined).

- [ ] **Step 3: Implement the queries**

In `src/lib/queries.ts`, extend the payload-types import to include `Page`:

```ts
import type { Ad, Category, MagazineIssue, Media, Page, Post, User, Video } from '@/payload-types'
```

Append (place alongside the other `getXBySlug` helpers, e.g. after `getCategoryBySlug`):

```ts
/** One published static/legal page by slug. Drafts return null. */
export async function getPageBySlug(slug: string): Promise<Page | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    limit: 1,
    // depth 1 resolves seo.ogImage (upload) for page OG metadata.
    depth: 1,
  })
  return docs[0] ?? null
}

/** All published pages (slug + updatedAt) — for the sitemap and static params. */
export async function getPublishedPages(): Promise<Pick<Page, 'slug' | 'updatedAt'>[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 100,
    depth: 0,
  })
  return docs.map((d) => ({ slug: d.slug, updatedAt: d.updatedAt }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/pages.int.spec.ts`
Expected: PASS (4 tests green). The `revalidateAfterChange`/`revalidateAfterDelete` hooks are try/catch-guarded, so create/delete outside a Next request scope won't throw.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts tests/int/pages.int.spec.ts
git commit -m "feat(pages): getPageBySlug + getPublishedPages (published-only)"
```

---

### Task 3: `PageView` component

**Files:**
- Create: `src/components/PageView.tsx`
- Test: `tests/int/page-view.int.spec.ts` (create — jsdom render test)

**Interfaces:**
- Consumes: `Page` type, `formatDate` from `@/lib/format`, `pageShowsUpdatedDate` from `@/lib/routes`, `RichText` from `@payloadcms/richtext-lexical/react`.
- Produces: `PageView({ page }: { page: Page })` — a synchronous (non-async) presentational component.

- [ ] **Step 1: Write the failing test**

Create `tests/int/page-view.int.spec.ts`:

```ts
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { PageView } from '@/components/PageView'
import type { Page } from '@/payload-types'

function makePage(slug: string): Page {
  return {
    id: 1,
    title: `عنوان ${slug}`,
    slug,
    updatedAt: '2026-07-07T00:00:00.000Z',
    createdAt: '2026-07-07T00:00:00.000Z',
    content: {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        direction: 'rtl',
        children: [
          {
            type: 'paragraph',
            version: 1,
            format: '',
            indent: 0,
            direction: 'rtl',
            children: [{ type: 'text', version: 1, text: 'نص تجريبي', format: 0, detail: 0, mode: 'normal', style: '' }],
          },
        ],
      },
    },
  } as unknown as Page
}

describe('PageView', () => {
  it('renders the page title as a heading', () => {
    render(<PageView page={makePage('about')} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('عنوان about')
  })

  it('shows "آخر تحديث" on legal pages (privacy)', () => {
    render(<PageView page={makePage('privacy')} />)
    expect(screen.getByText(/آخر تحديث/)).toBeTruthy()
  })

  it('hides "آخر تحديث" on non-legal pages (about)', () => {
    render(<PageView page={makePage('about')} />)
    expect(screen.queryByText(/آخر تحديث/)).toBeNull()
  })
})
```

Note: `@testing-library/react` (16.3.0) is installed; vitest env is jsdom. `toHaveTextContent` works via jest-dom-style matcher if configured — if `toHaveTextContent` is unavailable, use `expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('عنوان about')` instead. Prefer the `.textContent`/`toContain` form to avoid a jest-dom dependency.

Rewrite the first assertion defensively (no jest-dom needed):

```ts
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('عنوان about')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/page-view.int.spec.ts`
Expected: FAIL — cannot find module `@/components/PageView`.

- [ ] **Step 3: Implement the component**

Create `src/components/PageView.tsx`:

```tsx
import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'

import type { Page } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { pageShowsUpdatedDate } from '@/lib/routes'

/** Renders one static/legal page: breadcrumb, title, optional last-updated, rich body. */
export function PageView({ page }: { page: Page }) {
  const showUpdated = pageShowsUpdatedDate(page.slug ?? '')

  return (
    <main className="mx-auto max-w-[800px] px-4 py-8">
      <article>
        <nav className="mb-3 text-sm text-zinc-500">
          <Link href="/" className="hover:text-brand-600">الرئيسية</Link>
          <span className="px-1">/</span>
          <span className="text-zinc-700">{page.title}</span>
        </nav>

        <h1 className="text-3xl font-extrabold leading-tight text-zinc-900 sm:text-4xl">{page.title}</h1>

        {showUpdated && page.updatedAt && (
          <p className="mt-2 text-sm text-zinc-500">
            آخر تحديث:{' '}
            <time dateTime={new Date(page.updatedAt).toISOString()}>{formatDate(page.updatedAt)}</time>
          </p>
        )}

        {page.content && (
          <div className="mt-6">
            <RichText data={page.content} className="prose-ar" />
          </div>
        )}
      </article>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx pnpm@10.18.0 run test:int -- tests/int/page-view.int.spec.ts`
Expected: PASS (3 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/PageView.tsx tests/int/page-view.int.spec.ts
git commit -m "feat(pages): PageView component (breadcrumb, title, last-updated, rich body)"
```

---

### Task 4: Dispatcher — resolve category, then page, in `[category]/page.tsx`

**Files:**
- Modify: `src/app/(frontend)/[category]/page.tsx` (full replacement below)

**Interfaces:**
- Consumes: `getPageBySlug`, `getPublishedPages` (Task 2); `PageView` (Task 3); `pageUrl` (Task 1); existing `getCategories`, `getCategoryBySlug`, `getPosts`, `getSiteConfig`, `buildMetadata`, `ogImageUrl`, `breadcrumbJsonLd`, `categoryUrl`.
- Produces: no new exports; changes routing behaviour so `/<pageSlug>` renders a page.

- [ ] **Step 1: Replace the route file**

Replace the entire contents of `src/app/(frontend)/[category]/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { PageView } from '@/components/PageView'
import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import {
  getCategories,
  getCategoryBySlug,
  getPageBySlug,
  getPosts,
  getPublishedPages,
  getSiteConfig,
} from '@/lib/queries'
import { categoryUrl, pageUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl, breadcrumbJsonLd } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  const [categories, pages] = await Promise.all([getCategories(), getPublishedPages()])
  return [
    ...categories.filter((c) => c.slug).map((c) => ({ category: c.slug as string })),
    ...pages.filter((p) => p.slug).map((p) => ({ category: p.slug as string })),
  ]
}

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params

  const category = await getCategoryBySlug(slug)
  if (category) {
    const cfg = await getSiteConfig()
    return buildMetadata({
      title: category.seo?.metaTitle || category.name,
      description: category.seo?.metaDescription || category.description,
      path: categoryUrl(category.slug ?? slug),
      image: ogImageUrl(category.seo?.ogImage, cfg.defaultOgImage),
      type: 'website',
      noIndex: category.seo?.noIndex ?? false,
      canonicalOverride: category.seo?.canonicalURL,
    })
  }

  const page = await getPageBySlug(slug)
  if (page) {
    const cfg = await getSiteConfig()
    return buildMetadata({
      title: page.seo?.metaTitle || page.title,
      description: page.seo?.metaDescription || undefined,
      path: pageUrl(page.slug ?? slug),
      image: ogImageUrl(page.seo?.ogImage, cfg.defaultOgImage),
      type: 'website',
      noIndex: page.seo?.noIndex ?? false,
      canonicalOverride: page.seo?.canonicalURL,
    })
  }

  return {}
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params

  const category = await getCategoryBySlug(slug)
  if (category) {
    const { page: pageParam } = await searchParams
    const page = Math.max(1, Number(pageParam) || 1)

    const crumbs = [
      { name: 'الرئيسية', url: '/' },
      { name: category.name, url: categoryUrl(category.slug ?? slug) },
    ]

    const { docs, totalPages } = await getPosts({ categoryId: category.id, limit: 16, page })

    return (
      <main className="lf-container py-8">
        <JsonLd data={breadcrumbJsonLd(crumbs)} />
        <SectionHeading title={category.name} />

        {docs.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">لا توجد مقالات في هذا القسم بعد.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {docs.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        <Pagination basePath={categoryUrl(slug)} page={page} totalPages={totalPages} />
      </main>
    )
  }

  const page = await getPageBySlug(slug)
  if (page) return <PageView page={page} />

  notFound()
}
```

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors (all imports resolve; `Props`/return types consistent).

- [ ] **Step 3: Lint**

Run: `npx pnpm@10.18.0 run lint`
Expected: no errors for the modified file.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(frontend)/[category]/page.tsx"
git commit -m "feat(pages): dispatch [category] route to page then 404 (fixes /privacy 404)"
```

Behavioural verification (route renders a real page, unknown 404s, category unaffected) is covered by the E2E suite in Task 6, once content is seeded in Task 5.

---

### Task 5: Seed the five pages (idempotent, real Arabic draft copy)

**Files:**
- Modify: `src/seed/index.ts` (add `richDoc` helper + `SEED_PAGES` + seeding loop; run the seed)

**Interfaces:**
- Consumes: existing `payload` client and `run()` structure in the seed script.
- Produces: five published `pages` rows in Neon with slugs `about`, `editorial-board`, `advertise`, `privacy`, `terms`.

- [ ] **Step 1: Add the `richDoc` Lexical helper**

In `src/seed/index.ts`, below the existing `lexical(paragraphs)` function, add a richer block builder (leave `lexical` untouched so sample posts keep working):

```ts
/** A rich-text block for static pages: a heading, a paragraph, or a bullet list. */
type PageBlock = { h2: string } | { p: string } | { ul: string[] }

const textNode = (text: string) => ({
  type: 'text' as const,
  version: 1,
  text,
  format: 0,
  detail: 0,
  mode: 'normal' as const,
  style: '',
})

/** Build a Lexical editor state from ordered heading / paragraph / list blocks (RTL). */
function richDoc(blocks: PageBlock[]) {
  const children = blocks.map((block) => {
    if ('h2' in block) {
      return {
        type: 'heading' as const,
        tag: 'h2' as const,
        version: 1,
        format: '' as const,
        indent: 0,
        direction: 'rtl' as const,
        children: [textNode(block.h2)],
      }
    }
    if ('ul' in block) {
      return {
        type: 'list' as const,
        listType: 'bullet' as const,
        tag: 'ul' as const,
        start: 1,
        version: 1,
        format: '' as const,
        indent: 0,
        direction: 'rtl' as const,
        children: block.ul.map((item, i) => ({
          type: 'listitem' as const,
          value: i + 1,
          version: 1,
          format: '' as const,
          indent: 0,
          direction: 'rtl' as const,
          children: [textNode(item)],
        })),
      }
    }
    return {
      type: 'paragraph' as const,
      version: 1,
      format: '' as const,
      indent: 0,
      direction: 'rtl' as const,
      textFormat: 0,
      children: [textNode(block.p)],
    }
  })

  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'rtl' as const,
      children,
    },
  }
}
```

- [ ] **Step 2: Add the `SEED_PAGES` data**

Add near the other seed data arrays (e.g. after `SAMPLE_POSTS`):

```ts
type SeedPage = { slug: string; title: string; blocks: PageBlock[] }

// NOTE: AI-drafted placeholder copy — privacy/terms must be human-reviewed before launch.
const SEED_PAGES: SeedPage[] = [
  {
    slug: 'about',
    title: 'من نحن',
    blocks: [
      { p: '«لالة فاطمة» مجلة إلكترونية مغربية موجّهة للمرأة، تواكب عالم المشاهير والموضة والجمال والصحة والمطبخ بمحتوى عربي أصيل وقريب من اهتمامات القارئة المغربية والعربية.' },
      { p: 'نسعى إلى تقديم محتوى موثوق وملهم يجمع بين المتعة والفائدة، يعدّه فريق تحرير متخصّص يحرص على الدقة ومواكبة أحدث المستجدات.' },
      { h2: 'رؤيتنا' },
      { p: 'أن نكون المرجع الأول للمرأة المغربية والعربية في كل ما يهمّها من موضوعات يومية وملهمة.' },
      { h2: 'شبكتنا' },
      { p: '«لالة فاطمة» جزء من شبكة NewPub الإعلامية المغربية.' },
    ],
  },
  {
    slug: 'editorial-board',
    title: 'هيئة التحرير',
    blocks: [
      { p: 'يتألّف فريق «لالة فاطمة» من محرّرين وكتّاب متخصّصين في مجالات المشاهير والموضة والجمال والصحة والمطبخ، يعملون على تقديم محتوى دقيق ومتجدّد.' },
      { h2: 'التواصل مع هيئة التحرير' },
      { p: 'لأي استفسار تحريري أو اقتراح موضوع، يمكنكم مراسلتنا عبر البريد الإلكتروني: contact@lallafatema.ma' },
    ],
  },
  {
    slug: 'advertise',
    title: 'للإعلان على موقعنا',
    blocks: [
      { p: 'يوفّر موقع «لالة فاطمة» مساحات إعلانية متنوّعة تصل إلى جمهور واسع من النساء في المغرب والعالم العربي.' },
      { h2: 'خيارات الإعلان' },
      { ul: [
        'إعلانات بانر في الصفحة الرئيسية وصفحات الأقسام',
        'محتوى مموّل وتغطيات خاصة',
        'حملات عبر النشرة البريدية ووسائل التواصل الاجتماعي',
      ] },
      { h2: 'للتواصل' },
      { p: 'لطلب عرض الأسعار وتفاصيل الحملات الإعلانية، تواصلوا معنا عبر البريد الإلكتروني: ads@lallafatema.ma' },
    ],
  },
  {
    slug: 'privacy',
    title: 'سياسة الخصوصية',
    blocks: [
      { p: 'نحترم في «لالة فاطمة» خصوصية زوّارنا ونلتزم بحماية بياناتهم الشخصية. توضّح هذه السياسة أنواع المعلومات التي نجمعها وكيفية استخدامها.' },
      { h2: 'المعلومات التي نجمعها' },
      { ul: [
        'بيانات الاستخدام التقنية مثل نوع المتصفّح والجهاز وصفحات الزيارة',
        'المعلومات التي تزوّدنا بها طوعًا، كعنوان البريد الإلكتروني عند الاشتراك في النشرة',
      ] },
      { h2: 'ملفات تعريف الارتباط (الكوكيز)' },
      { p: 'نستخدم ملفات تعريف الارتباط لتحسين تجربة التصفّح وقياس الأداء وعرض إعلانات مناسبة. يمكنكم إدارة تفضيلاتكم في أي وقت من خلال إعدادات ملفات تعريف الارتباط في أسفل الموقع.' },
      { h2: 'مشاركة البيانات' },
      { p: 'لا نبيع بياناتكم الشخصية. قد نشاركها مع مزوّدي خدمات موثوقين (مثل خدمات التحليلات والإعلانات) بالقدر اللازم لتشغيل الموقع.' },
      { h2: 'حقوقكم' },
      { p: 'يحقّ لكم طلب الاطّلاع على بياناتكم أو تصحيحها أو حذفها. للتواصل بخصوص الخصوصية: privacy@lallafatema.ma' },
    ],
  },
  {
    slug: 'terms',
    title: 'شروط الاستخدام',
    blocks: [
      { p: 'باستخدامكم موقع «لالة فاطمة» فإنكم توافقون على شروط الاستخدام التالية. يُرجى قراءتها بعناية.' },
      { h2: 'استخدام الموقع' },
      { p: 'يُتاح المحتوى لأغراض الاطّلاع الشخصي وغير التجاري. يُمنع إعادة نشر المحتوى أو نسخه دون إذن مسبق.' },
      { h2: 'الملكية الفكرية' },
      { p: 'جميع الحقوق محفوظة لموقع «لالة فاطمة». تظلّ العلامات والنصوص والصور ملكًا لأصحابها.' },
      { h2: 'حدود المسؤولية' },
      { p: 'نبذل جهدنا لضمان دقة المحتوى، لكنه يُقدَّم «كما هو» دون ضمانات. لا نتحمّل مسؤولية أي أضرار ناتجة عن استخدام الموقع.' },
      { h2: 'تعديل الشروط' },
      { p: 'قد نحدّث هذه الشروط من وقت لآخر، ويسري التحديث فور نشره على هذه الصفحة.' },
    ],
  },
]
```

- [ ] **Step 3: Add the idempotent seeding loop**

Inside `run()`, before the final `payload.logger.info('Seed complete.')`, add:

```ts
  // 5) Static/legal pages (idempotent by slug; slug passed explicitly so the
  //    Arabic title isn't slugified into a non-ASCII slug).
  for (const p of SEED_PAGES) {
    const exists = await payload.find({
      collection: 'pages',
      where: { slug: { equals: p.slug } },
      limit: 1,
    })
    if (exists.docs[0]) {
      payload.logger.info(`Page exists, skipping: ${p.slug}`)
      continue
    }
    await payload.create({
      collection: 'pages',
      data: {
        title: p.title,
        slug: p.slug,
        content: richDoc(p.blocks),
        _status: 'published',
      },
    })
    payload.logger.info(`Created page: ${p.slug}`)
  }
```

- [ ] **Step 4: Typecheck the seed**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors (Lexical node shapes accepted by the `pages.content` field type).

- [ ] **Step 5: Run the seed against Neon**

Run: `npx pnpm@10.18.0 run seed`
Expected: log lines `Created page: about` … `Created page: terms` (or `Page exists, skipping` on a re-run), then `Seed complete.` and clean exit.

- [ ] **Step 6: Verify the pages exist**

Run: `npx pnpm@10.18.0 run seed`
Expected on this second run: five `Page exists, skipping: <slug>` lines (proves idempotency — no duplicates).

- [ ] **Step 7: Commit**

```bash
git add src/seed/index.ts
git commit -m "feat(pages): seed 5 static/legal pages (idempotent, Arabic draft copy)"
```

---

### Task 6: Sitemap inclusion + E2E behaviour

**Files:**
- Modify: `src/app/(frontend)/sitemap.xml/route.ts` (add published pages)
- Test: `tests/e2e/pages.e2e.spec.ts` (create)

**Interfaces:**
- Consumes: `getPublishedPages` (Task 2), `pageUrl` (Task 1), existing `absoluteUrl`, `urlTag`.
- Produces: page URLs in `sitemap.xml`; end-to-end verification of routing.

- [ ] **Step 1: Add pages to the sitemap**

In `src/app/(frontend)/sitemap.xml/route.ts`:

Add imports at the top (extend the existing `@/lib/routes` import and add the query):

```ts
import { getPublishedPages } from '@/lib/queries'
import { postUrl, categoryUrl, authorUrl, magazineArchiveUrl, magazineIssueUrl, videoWatchUrl, pageUrl } from '@/lib/routes'
```

Fetch pages alongside the other collections — change the `Promise.all` destructuring to include `pages`:

```ts
  const [posts, categories, issues, videos, pages] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 2000,
      depth: 1,
    }),
    payload.find({ collection: 'categories', limit: 200, depth: 0 }),
    payload.find({
      collection: 'magazine-issues',
      where: { _status: { equals: 'published' } },
      sort: '-issueNumber',
      limit: 500,
      depth: 0,
    }),
    payload.find({
      collection: 'videos',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 500,
      depth: 0,
    }),
    getPublishedPages(),
  ])
```

Then, after the videos loop (before building the final `xml` string), add:

```ts
  for (const p of pages) {
    if (p.slug) urls.push(urlTag(absoluteUrl(pageUrl(p.slug)), p.updatedAt ?? undefined))
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx pnpm@10.18.0 exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Write the E2E test**

Create `tests/e2e/pages.e2e.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Static / legal pages', () => {
  test('/privacy renders 200 with content (the consent-banner link target)', async ({ page }) => {
    const res = await page.goto(`${BASE}/privacy`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'سياسة الخصوصية' })).toBeVisible()
    await expect(page.getByText(/آخر تحديث/)).toBeVisible()
  })

  test('/about renders 200 without a last-updated line', async ({ page }) => {
    const res = await page.goto(`${BASE}/about`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'من نحن' })).toBeVisible()
    await expect(page.getByText(/آخر تحديث/)).toHaveCount(0)
  })

  test('an unknown top-level slug still 404s', async ({ page }) => {
    const res = await page.goto(`${BASE}/no-such-page-zzz`)
    expect(res?.status()).toBe(404)
  })

  test('an existing category route still renders (no dispatcher regression)', async ({ page }) => {
    const res = await page.goto(`${BASE}/fashion`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 2, name: 'موضة' })).toBeVisible()
  })

  test('sitemap.xml lists the pages', async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xml`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('/privacy')
    expect(body).toContain('/about')
  })
})
```

Note: `SectionHeading` renders the category name; confirm its heading level. If `SectionHeading` is not an `<h2>`, adjust the category-route assertion to match the actual element (e.g. `page.getByText('موضة')`). Keep the assertion loose enough to verify a 200 + the category name is visible.

- [ ] **Step 4: Start the dev server**

In a separate terminal: `npx pnpm@10.18.0 run dev` (serves on :3000 against Neon, which now has the seeded pages from Task 5).

- [ ] **Step 5: Run the E2E test to verify it passes**

Run: `npx pnpm@10.18.0 run test:e2e -- tests/e2e/pages.e2e.spec.ts`
Expected: PASS — `/privacy` 200 with heading + last-updated; `/about` 200 without last-updated; unknown slug 404; category renders; sitemap lists pages.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(frontend)/sitemap.xml/route.ts" tests/e2e/pages.e2e.spec.ts
git commit -m "feat(pages): add pages to sitemap + e2e (fixes /privacy 404, no regression)"
```

---

### Task 7: Full regression + wiring verification

**Files:** none (verification only)

- [ ] **Step 1: Full integration suite**

Run: `npx pnpm@10.18.0 run test:int`
Expected: all integration specs pass (new page/route/PageView specs + existing).

- [ ] **Step 2: Full E2E suite**

Run (dev server on :3000): `npx pnpm@10.18.0 run test:e2e`
Expected: all E2E specs pass, including the existing consent suite whose privacy link now resolves.

- [ ] **Step 3: Manual consent-link check**

With the dev server running, load the home page in a fresh browser context, and in the consent banner click the privacy-policy link. Confirm it navigates to `/privacy` and renders (no 404). This is the original bug's acceptance check.

- [ ] **Step 4: Footer links check**

Confirm the footer's five links (`من نحن`, `هيئة التحرير`, `للإعلان على موقعنا`, `سياسة الخصوصية`, `شروط الاستخدام`) each resolve to a rendered page. No footer code change is expected — `FOOTER_PAGES` already points at these slugs.

- [ ] **Step 5: Typecheck + lint (final gate)**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 run lint`
Expected: clean.

- [ ] **Step 6: Update phase-progress memory**

Update `phase-progress.md` (and the `MEMORY.md` one-liner) to record Phase 8.1 (Legal & static pages) as DONE, and note the next Phase 8 sub-project to brainstorm.

---

## Self-Review

**Spec coverage:**
- Routing fallthrough (Approach A) → Task 4. ✓
- `getPageBySlug` + published-only → Task 2. ✓
- `PageView` with last-updated on privacy/terms only → Tasks 1 (rule) + 3 (component). ✓
- No schema change → enforced in Global Constraints; no migration task exists. ✓
- Five pages seeded idempotently with real Arabic draft copy → Task 5. ✓
- Consent `/privacy` 404 fixed → Task 4 (route) + Task 6/7 (verified). ✓
- Footer verify-only → Task 7 Step 4. ✓
- Sitemap includes pages → Task 6. ✓
- Per-page title/meta via seoField + buildMetadata → Task 4 `generateMetadata`. ✓
- Integration + E2E tests → Tasks 2, 3, 6. ✓
- Legal-copy review reminder → memory already saved; re-confirmed in Task 5 comment + Task 7 Step 6. ✓

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases" in steps; all code blocks are complete. The Arabic email addresses (`contact@`, `ads@`, `privacy@lallafatema.ma`) are intentional draft placeholders in *content*, flagged for human review — not plan placeholders.

**Type consistency:** `getPageBySlug(slug): Promise<Page | null>` and `getPublishedPages(): Promise<Pick<Page,'slug'|'updatedAt'>[]>` are used identically in Tasks 4 and 6. `pageShowsUpdatedDate`/`pageUrl` signatures match across Tasks 1, 3, 4, 6. `PageView({ page })` prop matches its call site in Task 4. `richDoc(blocks: PageBlock[])`/`PageBlock` used only within Task 5.
