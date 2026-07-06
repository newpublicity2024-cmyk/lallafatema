# Phase 6 — Magazine Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public magazine archive — a `/magazine` cover grid and `/magazine/[issueNumber]` issue page whose PDF loads only on demand (cover facade → native iframe) plus a download link.

**Architecture:** Two server-rendered ISR pages backed by two published-only Payload queries over the existing `magazine-issues` collection (no schema changes). A `PdfFacade` client component mirrors the existing video-facade pattern to keep the PDF off the critical path. Covers render through the existing `PostImage`/Cloudflare loader; the PDF is served straight from its media URL. SEO via a new `PublicationIssue` JSON-LD builder + sitemap entries; a constant nav item makes the archive discoverable.

**Tech Stack:** Next.js 16 (App Router, async `params`), Payload CMS 3.85 Local API, Tailwind v4, Vitest (`tests/int/**/*.int.spec.ts`), Playwright (`tests/e2e/**/*.e2e.spec.ts`).

## Global Constraints

- **pnpm invocation:** always `npx pnpm@10.18.0 …` (PATH pnpm is too old).
- **No schema changes.** `magazine-issues` (issueNumber unique/required, title, publishDate, cover→media required, pdf→media required, description; `versions.drafts`) and `media` (accepts `application/pdf`) already support everything.
- **Images only through `PostImage`** (custom Cloudflare `next/image` loader). The Vercel optimizer is never used. **The PDF is served directly from `pdf.url` — never through the image loader.**
- **ISR:** every page exports `export const revalidate = 3600`; **no `cookies()`/`headers()`** in any magazine page (keep them statically renderable).
- **Published-only queries:** filter `_status: { equals: 'published' }` in the query (the Local API bypasses access control).
- **RTL Arabic:** `dir` is set globally; use `.lf-container`, brand tokens (`brand-600` etc.), Arabic copy, and `formatDate` from `@/lib/format` for dates.
- **URL scheme:** archive `/magazine`; issue `/magazine/<issueNumber>` (e.g. `/magazine/167`).
- **Verify loop:** `npx pnpm@10.18.0 exec tsc --noEmit` + `npx pnpm@10.18.0 lint` after each task; full `npx pnpm@10.18.0 build` at Task 4.
- **Dev/admin:** `npx pnpm@10.18.0 dev` (reads `.env` → Neon). Local media uploads land in `./media` (R2 is unset, so Payload stores locally).

---

### Task 1: URL helpers + unit tests

Pure functions every page/query/test consumes. Fully TDD.

**Files:**
- Modify: `src/lib/routes.ts`
- Test: `tests/int/routes.int.spec.ts` (new)

**Interfaces:**
- Consumes: `MagazineIssue` type from `@/payload-types`.
- Produces: `magazineArchiveUrl(): string`, `magazineIssueUrl(issue: Pick<MagazineIssue,'issueNumber'>): string`, `issueNumberFromParam(param: string): number | null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/int/routes.int.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'

import {
  magazineArchiveUrl,
  magazineIssueUrl,
  issueNumberFromParam,
} from '@/lib/routes'

describe('magazine routes', () => {
  it('archive url is /magazine', () => {
    expect(magazineArchiveUrl()).toBe('/magazine')
  })

  it('issue url uses the issue number', () => {
    expect(magazineIssueUrl({ issueNumber: 167 })).toBe('/magazine/167')
  })

  it('parses a numeric issue-number param', () => {
    expect(issueNumberFromParam('167')).toBe(167)
    expect(issueNumberFromParam('1')).toBe(1)
  })

  it('rejects non-numeric / malformed params', () => {
    expect(issueNumberFromParam('abc')).toBeNull()
    expect(issueNumberFromParam('1a')).toBeNull()
    expect(issueNumberFromParam('')).toBeNull()
    expect(issueNumberFromParam('-5')).toBeNull()
    expect(issueNumberFromParam('1.5')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/routes.int.spec.ts`
Expected: FAIL — `magazineArchiveUrl` / `magazineIssueUrl` / `issueNumberFromParam` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/routes.ts`, extend the type import on line 1 to include `MagazineIssue`:

```ts
import type { Category, MagazineIssue, Post } from '@/payload-types'
```

Then append at the end of the file:

```ts
/** Magazine archive listing. */
export function magazineArchiveUrl(): string {
  return '/magazine'
}

/** Permalink for one digital issue — keyed on the unique, required issueNumber. */
export function magazineIssueUrl(issue: Pick<MagazineIssue, 'issueNumber'>): string {
  return `/magazine/${issue.issueNumber}`
}

/** Parse a `/magazine/[issueNumber]` route param → positive integer, else null. */
export function issueNumberFromParam(param: string): number | null {
  return /^\d+$/.test(param) ? Number(param) : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/routes.int.spec.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/routes.ts tests/int/routes.int.spec.ts
git commit -m "feat(magazine): URL helpers for the magazine archive"
```

---

### Task 2: Queries + issue card + archive listing page

The data layer plus the `/magazine` grid.

**Files:**
- Modify: `src/lib/queries.ts`
- Create: `src/components/IssueCard.tsx`
- Create: `src/app/(frontend)/magazine/page.tsx`

**Interfaces:**
- Consumes: `magazineArchiveUrl`, `magazineIssueUrl` (Task 1); `getSiteConfig`, `buildMetadata`, `ogImageUrl` (existing); `PostImage`, `SectionHeading`, `formatDate` (existing).
- Produces: `getMagazineIssues(): Promise<MagazineIssue[]>`, `getMagazineIssueByNumber(n: number): Promise<MagazineIssue | null>`, `IssueCard` component, the `/magazine` route.

- [ ] **Step 1: Add the two queries**

In `src/lib/queries.ts`, extend the type import (line 3) to include `MagazineIssue`:

```ts
import type { Ad, Category, MagazineIssue, Media, Post, User, Video } from '@/payload-types'
```

Append these two functions (anywhere among the other query exports):

```ts
/** All published magazine issues, newest first. `depth:1` populates covers. */
export async function getMagazineIssues(): Promise<MagazineIssue[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'magazine-issues',
    where: { _status: { equals: 'published' } },
    sort: '-issueNumber',
    depth: 1,
    limit: 200,
  })
  return docs
}

/** One published issue by its number, or null. `depth:1` populates cover + pdf. */
export async function getMagazineIssueByNumber(issueNumber: number): Promise<MagazineIssue | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'magazine-issues',
    where: {
      and: [{ issueNumber: { equals: issueNumber } }, { _status: { equals: 'published' } }],
    },
    depth: 1,
    limit: 1,
  })
  return docs[0] ?? null
}
```

- [ ] **Step 2: Create the issue card**

Create `src/components/IssueCard.tsx` (mirrors the `PostCard` `.lf-card` idiom — block image anchor over an aspect-reserved box, padded caption):

```tsx
import Link from 'next/link'

import type { MagazineIssue } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { magazineIssueUrl } from '@/lib/routes'
import { PostImage } from './PostImage'

/** One magazine issue in the archive grid: portrait cover + title + date. */
export function IssueCard({ issue }: { issue: MagazineIssue }) {
  const title = issue.title || `العدد ${issue.issueNumber}`
  const href = magazineIssueUrl(issue)

  return (
    <article className="lf-card group flex flex-col">
      <Link href={href} className="relative block aspect-[3/4] overflow-hidden">
        <PostImage
          image={issue.cover}
          alt={title}
          sizes="(max-width: 768px) 50vw, 25vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="p-4">
        <h3 className="text-lg font-medium leading-snug text-zinc-900 group-hover:text-brand-700">
          <Link href={href}>{title}</Link>
        </h3>
        {issue.publishDate && (
          <time
            dateTime={new Date(issue.publishDate).toISOString()}
            className="mt-1 block text-xs text-zinc-400"
          >
            {formatDate(issue.publishDate)}
          </time>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 3: Create the archive listing page**

Create `src/app/(frontend)/magazine/page.tsx`:

```tsx
import type { Metadata } from 'next'

import { IssueCard } from '@/components/IssueCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getMagazineIssues, getSiteConfig } from '@/lib/queries'
import { magazineArchiveUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl } from '@/lib/seo'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'أرشيف المجلة',
    description: 'تصفّحي أعداد مجلة لالة فاطمة الرقمية، واقرئي أو حمّلي كل عدد بصيغة PDF.',
    path: magazineArchiveUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
  })
}

export default async function MagazinePage() {
  const issues = await getMagazineIssues()

  return (
    <main className="lf-container py-8">
      <SectionHeading title="أعداد المجلة" />
      {issues.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">لا توجد أعداد بعد.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </main>
  )
}
```

> `SectionHeading` takes a `title` prop (see `src/app/(frontend)/author/[id]/page.tsx`). If its actual prop name differs, match the existing usage rather than the name here.

- [ ] **Step 4: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/components/IssueCard.tsx "src/app/(frontend)/magazine/page.tsx"
git commit -m "feat(magazine): archive listing page + queries + issue card"
```

---

### Task 3: PDF facade + issue detail page + JSON-LD

The per-issue page with the on-demand PDF viewer and structured data.

**Files:**
- Create: `src/components/PdfFacade.tsx`
- Modify: `src/lib/seo.ts`
- Create: `src/app/(frontend)/magazine/[issueNumber]/page.tsx`

**Interfaces:**
- Consumes: `getMagazineIssueByNumber` (Task 2); `issueNumberFromParam`, `magazineArchiveUrl`, `magazineIssueUrl` (Task 1); `buildMetadata`, `ogImageUrl`, `breadcrumbJsonLd` (existing); `JsonLd`, `PostImage`, `formatDate` (existing).
- Produces: `PdfFacade` component, `publicationIssueJsonLd(issue: MagazineIssue)` in `seo.ts`, the `/magazine/[issueNumber]` route.

- [ ] **Step 1: Create the PDF facade**

Create `src/components/PdfFacade.tsx`:

```tsx
'use client'

import { useState } from 'react'

import type { Media } from '@/payload-types'
import { PostImage } from './PostImage'

/**
 * Cover-first PDF facade. Shows the cover + read/download buttons; the (large)
 * PDF is only fetched when the reader clicks "قراءة العدد" — so it stays off the
 * initial render's critical path (mirrors the video-facade pattern). The native
 * <iframe> lets the browser render the PDF; download is a plain anchor.
 */
export function PdfFacade({
  pdfUrl,
  cover,
  title,
}: {
  pdfUrl: string
  cover: number | Media | null | undefined
  title: string
}) {
  const [reading, setReading] = useState(false)

  if (reading) {
    return (
      <iframe
        src={pdfUrl}
        title={title}
        className="h-[80vh] w-full rounded-lg border border-zinc-200"
      />
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-brand-100">
        <PostImage image={cover} alt={title} sizes="(max-width: 768px) 100vw, 384px" />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => setReading(true)}
          className="rounded-md bg-brand-600 px-5 py-2 text-sm font-bold text-white"
        >
          قراءة العدد
        </button>
        <a
          href={pdfUrl}
          download
          rel="noopener"
          className="rounded-md border border-brand-600 px-5 py-2 text-sm font-bold text-brand-600"
        >
          تحميل PDF
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the JSON-LD builder**

In `src/lib/seo.ts`, extend the payload-types import (line 4) to include `MagazineIssue`:

```ts
import type { Media, MagazineIssue, Post, Video } from '@/payload-types'
```

Append a builder next to the other JSON-LD builders (it reuses the module-local `asMedia`, `CONTEXT`, and `absoluteUrl` already used by `videoObjectJsonLd`):

```ts
export function publicationIssueJsonLd(issue: MagazineIssue) {
  const cover = asMedia(issue.cover)
  const pdf = asMedia(issue.pdf)
  return {
    '@context': CONTEXT,
    '@type': 'PublicationIssue',
    name: issue.title || `العدد ${issue.issueNumber}`,
    issueNumber: issue.issueNumber,
    datePublished: issue.publishDate ?? undefined,
    image: cover?.url ? absoluteUrl(cover.url) : undefined,
    inLanguage: 'ar',
    isPartOf: { '@type': 'Periodical', name: 'لالة فاطمة' },
    associatedMedia: pdf?.url
      ? { '@type': 'MediaObject', contentUrl: absoluteUrl(pdf.url), encodingFormat: 'application/pdf' }
      : undefined,
  }
}
```

- [ ] **Step 3: Create the issue detail page**

Create `src/app/(frontend)/magazine/[issueNumber]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { PdfFacade } from '@/components/PdfFacade'
import { formatDate } from '@/lib/format'
import { getMagazineIssueByNumber, getSiteConfig } from '@/lib/queries'
import { issueNumberFromParam, magazineArchiveUrl, magazineIssueUrl } from '@/lib/routes'
import { breadcrumbJsonLd, buildMetadata, ogImageUrl, publicationIssueJsonLd } from '@/lib/seo'

export const revalidate = 3600

type Props = { params: Promise<{ issueNumber: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { issueNumber } = await params
  const n = issueNumberFromParam(issueNumber)
  if (n === null) return {}
  const issue = await getMagazineIssueByNumber(n)
  if (!issue) return {}
  const cfg = await getSiteConfig()
  const title = issue.title || `العدد ${issue.issueNumber}`
  return buildMetadata({
    title,
    description: issue.description,
    path: magazineIssueUrl(issue),
    image: ogImageUrl(issue.cover, cfg.defaultOgImage),
  })
}

export default async function MagazineIssuePage({ params }: Props) {
  const { issueNumber } = await params
  const n = issueNumberFromParam(issueNumber)
  if (n === null) notFound()

  const issue = await getMagazineIssueByNumber(n)
  if (!issue) notFound()

  const pdf = typeof issue.pdf === 'object' ? issue.pdf : null
  const title = issue.title || `العدد ${issue.issueNumber}`

  return (
    <main className="lf-container py-8">
      <JsonLd data={publicationIssueJsonLd(issue)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'المجلة', url: magazineArchiveUrl() },
          { name: title, url: magazineIssueUrl(issue) },
        ])}
      />

      <nav aria-label="مسار التنقل" className="mb-4 text-sm text-zinc-500">
        <a href="/" className="hover:text-brand-600">
          الرئيسية
        </a>
        {' / '}
        <a href={magazineArchiveUrl()} className="hover:text-brand-600">
          المجلة
        </a>
        {' / '}
        <span className="text-zinc-700">{title}</span>
      </nav>

      <header className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-zinc-900">{title}</h1>
        {issue.publishDate && (
          <time
            dateTime={new Date(issue.publishDate).toISOString()}
            className="mt-1 block text-sm text-zinc-500"
          >
            {formatDate(issue.publishDate)}
          </time>
        )}
        {issue.description && (
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
            {issue.description}
          </p>
        )}
      </header>

      {pdf?.url ? (
        <PdfFacade pdfUrl={pdf.url} cover={issue.cover} title={title} />
      ) : (
        <p className="py-8 text-center text-zinc-500">ملف العدد غير متوفر حاليًا.</p>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PdfFacade.tsx src/lib/seo.ts "src/app/(frontend)/magazine/[issueNumber]/page.tsx"
git commit -m "feat(magazine): issue detail page with PDF facade + PublicationIssue JSON-LD"
```

---

### Task 4: Sitemap + nav + seed + e2e + build

Wire discovery/SEO, add a demo issue for verification, and prove the flow end-to-end. **The subagent writes the code + seed script + e2e spec and runs the build; the controller runs the seed and the e2e** (both write to / drive the live Neon DB + dev server, kept under controller control — same split as Phase 5's migration/e2e).

**Files:**
- Modify: `src/app/(frontend)/sitemap.xml/route.ts`
- Modify: `src/components/Header.tsx`
- Create: `src/seed/magazine.ts`
- Create: `tests/e2e/magazine.e2e.spec.ts`

**Interfaces:**
- Consumes: `magazineArchiveUrl`, `magazineIssueUrl` (Task 1); the `/magazine` + `/magazine/[issueNumber]` routes (Tasks 2-3).
- Produces: magazine URLs in the sitemap, a constant "المجلة" nav item, an idempotent demo-issue seed, and the e2e spec.

- [ ] **Step 1: Add magazine URLs to the sitemap**

In `src/app/(frontend)/sitemap.xml/route.ts`, extend the routes import (line 3):

```ts
import { postUrl, categoryUrl, authorUrl, magazineArchiveUrl, magazineIssueUrl } from '@/lib/routes'
```

Add a third fetch to the `Promise.all` (alongside posts + categories):

```ts
  const [posts, categories, issues] = await Promise.all([
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
  ])
```

Then, immediately before the final `const xml = …` line, append the magazine URLs (archive index only when at least one issue exists):

```ts
  if (issues.docs.length) {
    urls.push(urlTag(absoluteUrl(magazineArchiveUrl())))
    for (const m of issues.docs) {
      urls.push(urlTag(absoluteUrl(magazineIssueUrl(m)), m.updatedAt ?? undefined))
    }
  }
```

- [ ] **Step 2: Add the constant nav item**

In `src/components/Header.tsx`, the `items` array is built from the admin menu or a category fallback. Append a constant magazine entry so the archive is always reachable. Change the `const items … = <ternary>` declaration so the ternary result is spread into a new array with the magazine item appended:

```tsx
  const baseItems: { label: string; href: string; children: { label: string; href: string }[] }[] =
    menu.items && menu.items.length > 0
      ? menu.items.map((item) => ({
          label: item.label,
          href: hrefOf(item),
          children: (item.children ?? []).map((c) => ({ label: c.label, href: hrefOf(c) })),
        }))
      : categories
          .filter((c) => !c.parent)
          .map((c) => ({ label: c.name, href: categoryUrl(c.slug ?? ''), children: [] }))

  // Always expose the magazine archive (a guaranteed floor, independent of the
  // admin menu / category fallback). Admins can also add their own entry.
  const items = [...baseItems, { label: 'المجلة', href: '/magazine', children: [] }]
```

- [ ] **Step 3: Create the demo-issue seed script**

Create `src/seed/magazine.ts` (idempotent; reuses a repo image as the cover and writes a minimal valid PDF for the file). It mirrors `src/seed/index.ts`'s Payload init (`getPayload({ config: await config })`) and uploads via `payload.create({ collection:'media', filePath })` — local `./media` storage since R2 is unset:

```ts
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// A minimal valid single-page PDF (blank A4) — enough for the archive to serve
// and the browser to render inside the facade iframe.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`

const ISSUE_NUMBER = 999

async function main() {
  const payload = await getPayload({ config: await config })

  const existing = await payload.find({
    collection: 'magazine-issues',
    where: { issueNumber: { equals: ISSUE_NUMBER } },
    limit: 1,
  })
  if (existing.docs.length) {
    console.log(`Magazine issue #${ISSUE_NUMBER} already seeded — skipping.`)
    return
  }

  const cover = await payload.create({
    collection: 'media',
    data: { alt: 'غلاف عدد تجريبي' },
    filePath: join(process.cwd(), 'ref-foochia-top.jpeg'),
  })

  const pdfPath = join(tmpdir(), 'lf-sample-issue.pdf')
  writeFileSync(pdfPath, MINIMAL_PDF)
  const pdf = await payload.create({
    collection: 'media',
    data: { alt: 'ملف عدد تجريبي (PDF)' },
    filePath: pdfPath,
  })

  await payload.create({
    collection: 'magazine-issues',
    data: {
      issueNumber: ISSUE_NUMBER,
      title: 'عدد تجريبي',
      publishDate: new Date('2026-07-01').toISOString(),
      cover: cover.id,
      pdf: pdf.id,
      description: 'عدد تجريبي لأغراض العرض والاختبار.',
      _status: 'published',
    },
  })

  console.log(`Seeded published magazine issue #${ISSUE_NUMBER}.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 4: Create the e2e spec**

Create `tests/e2e/magazine.e2e.spec.ts` (requires ≥1 published issue — the controller seeds one in Step 6):

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Magazine archive', () => {
  test('lists issues, opens one, shows facade + download, loads viewer on read', async ({ page }) => {
    await page.goto(`${BASE}/magazine`)

    const firstCard = page.locator('a[href^="/magazine/"]').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()
    await expect(page).toHaveURL(/\/magazine\/\d+/)

    const read = page.getByRole('button', { name: 'قراءة العدد' })
    const download = page.getByRole('link', { name: 'تحميل PDF' })
    await expect(read).toBeVisible()
    await expect(download).toHaveAttribute('href', /.+/)

    // The PDF iframe is absent until the reader opts in.
    await expect(page.locator('iframe')).toHaveCount(0)
    await read.click()
    const frame = page.locator('iframe')
    await expect(frame).toBeVisible()
    await expect(frame).toHaveAttribute('src', /.+/)
  })
})
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 lint && npx pnpm@10.18.0 build`
Expected: all clean. `/magazine` renders as `○ (Static)`; `/magazine/[issueNumber]` appears as a dynamic route (`ƒ`) — both fine. No `cookies()`/dynamic-usage errors.

- [ ] **Step 6: Commit (implementer stops here)**

```bash
git add "src/app/(frontend)/sitemap.xml/route.ts" src/components/Header.tsx src/seed/magazine.ts tests/e2e/magazine.e2e.spec.ts
git commit -m "feat(magazine): sitemap entries, nav item, demo seed, e2e coverage"
```

- [ ] **Step 7: (Controller) Seed the demo issue + run the e2e**

The controller performs these live steps (subagent does NOT):
1. Seed the demo issue: `npx pnpm@10.18.0 exec tsx src/seed/magazine.ts` → expect "Seeded published magazine issue #999." (or the idempotent skip on re-run). This writes demo rows to Neon + a cover/PDF into `./media`.
2. Start the dev server, wait for `:3000`, run the e2e: `npx pnpm@10.18.0 exec playwright test --config=playwright.config.ts tests/e2e/magazine.e2e.spec.ts` → expect PASS.
3. Manually confirm (Playwright MCP or browser): `/magazine` shows the cover grid, the issue page shows the facade, clicking قراءة العدد mounts the iframe, تحميل PDF points at the PDF, "المجلة" appears in the header nav, and covers make zero `/_next/image` requests.

---

## Self-Review

**Spec coverage:**
- `/magazine` archive grid, newest-first, published-only → Task 2 (`getMagazineIssues` + page). ✓
- `/magazine/[issueNumber]`, 404 on bad/unpublished → Task 3 (page + `issueNumberFromParam` + `notFound`). ✓
- Cover facade → native iframe + download → Task 3 (`PdfFacade`). ✓
- No schema changes; PDF served from `pdf.url`, covers via `PostImage` → Tasks 2-3. ✓
- `PublicationIssue` JSON-LD (issueNumber, datePublished, image, isPartOf Periodical, associatedMedia PDF) → Task 3 (`publicationIssueJsonLd`). ✓
- Breadcrumb → Task 3 (`breadcrumbJsonLd`). ✓
- Sitemap entries → Task 4. ✓
- Constant "المجلة" nav item → Task 4 (Header). ✓
- ISR (`revalidate=3600`, no `cookies()`) → Tasks 2-3, asserted in Task 4 build. ✓
- Unit tests (routes helpers) → Task 1. e2e (archive→issue→facade→download) → Task 4. ✓
- URL scheme `/magazine/<issueNumber>` → Task 1 helpers, used throughout. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete; the one soft note (SectionHeading prop name) points at an existing in-repo usage to match. ✓

**Type consistency:** `MagazineIssue` imported in `routes.ts`, `queries.ts`, `seo.ts`. `getMagazineIssues`/`getMagazineIssueByNumber`, `magazineArchiveUrl`/`magazineIssueUrl`/`issueNumberFromParam`, `IssueCard`, `PdfFacade({pdfUrl,cover,title})`, `publicationIssueJsonLd(issue)` names are identical across the tasks that define and consume them. `issueNumber`-keyed URLs and the `1:…` cookie format are not involved here. ✓

**Out of scope (unchanged from spec):** Meilisearch search, per-video pages, Brevo newsletter, OneSignal push, PDF.js reader, download gating, pagination.
