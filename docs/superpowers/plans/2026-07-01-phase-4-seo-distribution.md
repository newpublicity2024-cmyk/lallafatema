# Phase 4 — SEO & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Lalla Fatema public site fully discoverable and syndicatable — complete per-page metadata, JSON-LD structured data, sitemaps (incl. Google News), RSS, `llms.txt`, and admin-editable 301-redirect groundwork.

**Architecture:** A single `src/lib/seo.ts` centralizes URL/OG/JSON-LD logic; page `generateMetadata` functions and a `<JsonLd>` component consume it. Feeds/sitemaps/`llms.txt` are Next route handlers reading Payload's Local API. Redirects are a Payload collection served through Next middleware via a cached JSON map route.

**Tech Stack:** Next.js 16 (App Router), Payload CMS 3.85, Neon Postgres, TypeScript, Tailwind v4. Arabic RTL. Custom Cloudflare image loader (Vercel optimizer never used).

## Global Constraints

- **DO NOT COMMIT during execution.** The working tree has uncommitted dashboard changes (ads, site settings, admin branding) the user has NOT authorized committing. Phase 4 edits layer on top; leave everything staged-but-uncommitted for the user to review and commit together. Each task ends with a **verify checkpoint**, not a commit.
- Canonical base URL: `https://lallafatema.ma`; prefer `process.env.NEXT_PUBLIC_SERVER_URL` when set.
- RTL/Arabic throughout: `ar` / `ar_AR` language in metadata, feeds, sitemaps, `llms.txt`; Arabic titles/descriptions.
- Zero-CLS: Phase 4 adds only `<head>`/JSON-LD output and non-visual routes — no above-the-fold layout changes.
- Schema changes are migration-driven (`push: false`): `npx pnpm@10.18.0 exec payload migrate:create <name>`, then `... migrate`, then regenerate types.
- Vercel image optimizer NEVER used. OG images resolve to absolute URLs (Cloudflare loader when `NEXT_PUBLIC_IMAGE_HOST` set, else raw absolute `media.url`).
- Run commands with `npx pnpm@10.18.0` (PATH pnpm is too old). Dev admin: `dev@lallafatema.ma` / `DevAdmin!2026`.
- Verify command (used throughout): `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .`

---

## File Structure

**New files**
- `src/lib/seo.ts` — URL helpers, `buildMetadata`, JSON-LD builders.
- `src/components/JsonLd.tsx` — renders a JSON-LD `<script>`.
- `src/collections/Redirects.ts` — admin-editable 301/302 redirects.
- `src/middleware.ts` — request-time redirect matcher.
- `src/app/(frontend)/redirects-map.json/route.ts` — cached redirect map for middleware.
- `src/app/(frontend)/sitemap.xml/route.ts` — main sitemap.
- `src/app/(frontend)/news-sitemap.xml/route.ts` — Google News sitemap (last 48h).
- `src/app/(frontend)/rss.xml/route.ts` — RSS 2.0 feed.
- `src/app/(frontend)/llms.txt/route.ts` — AI-visibility Markdown.
- `src/app/robots.ts` — robots.txt (Next convention).
- 2 migration files (auto-generated).

**Modified files**
- `src/collections/Categories.ts` (+ `seoField`)
- `src/hooks/revalidate.ts` (+ `revalidateRedirects`)
- `src/payload.config.ts` (register `Redirects`)
- `src/app/(frontend)/layout.tsx` (metadataBase, default OG, RSS alternate, site-wide JSON-LD)
- `src/app/(frontend)/page.tsx` (generateMetadata + homepage VideoObject JSON-LD)
- `src/app/(frontend)/[category]/[slug]/page.tsx` (full metadata + Article/Recipe/Breadcrumb JSON-LD)
- `src/app/(frontend)/[category]/page.tsx` (metadata + Breadcrumb JSON-LD)
- `src/app/(frontend)/author/[id]/page.tsx` (metadata)
- `src/payload-types.ts` (regenerated)

---

## Task 1: Central SEO utilities (`lib/seo.ts` + `<JsonLd>`)

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/components/JsonLd.tsx`

**Interfaces:**
- Consumes: `SiteConfig` from `@/lib/queries`; `Media`, `Post`, `Video` from `@/payload-types`; `SITE` from `@/lib/site`; `postUrl`, `categoryUrl`, `authorUrl` from `@/lib/routes`.
- Produces:
  - `SITE_URL: string`
  - `absoluteUrl(path: string): string`
  - `ogImageUrl(image: number | Media | null | undefined, fallback?: Media | null): string | undefined`
  - `buildMetadata(args: BuildMetaArgs): Metadata`
  - `organizationJsonLd(cfg: SiteConfig): object`
  - `webSiteJsonLd(cfg: SiteConfig): object`
  - `newsArticleJsonLd(post: Post, cfg: SiteConfig): object`
  - `recipeJsonLd(post: Post): object | null`
  - `videoObjectJsonLd(video: Video): object`
  - `breadcrumbJsonLd(items: { name: string; url: string }[]): object`
  - `<JsonLd data={…} />`

- [ ] **Step 1: Write `src/lib/seo.ts`**

```ts
import type { Metadata } from 'next'

import type { SiteConfig } from '@/lib/queries'
import type { Media, Post, Video } from '@/payload-types'
import { SITE } from '@/lib/site'
import { authorUrl, categoryUrl, postUrl } from '@/lib/routes'

/** Canonical origin for every absolute URL (canonical tags, OG, sitemaps, RSS). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://lallafatema.ma').replace(
  /\/$/,
  '',
)

const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST

/** Make any path or already-absolute URL absolute against SITE_URL. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

const asMedia = (v: number | Media | null | undefined): Media | null =>
  v && typeof v === 'object' ? v : null

/**
 * Absolute 1200×630 OG image URL. Routes through Cloudflare Image Transformations
 * when NEXT_PUBLIC_IMAGE_HOST is set (same edge path as next/image), otherwise the
 * raw absolute media URL. Falls back to `fallback` (Site Settings defaultOgImage).
 * Never touches Vercel's optimizer.
 */
export function ogImageUrl(
  image: number | Media | null | undefined,
  fallback?: Media | null,
): string | undefined {
  const media = asMedia(image) ?? fallback ?? null
  if (!media?.url) return undefined
  const src = absoluteUrl(media.url)
  if (!IMAGE_HOST) return src
  const host = IMAGE_HOST.replace(/\/$/, '')
  const source = src.startsWith('http') ? src : src.replace(/^\//, '')
  return `${host}/cdn-cgi/image/width=1200,height=630,fit=cover,format=auto/${source}`
}

type BuildMetaArgs = {
  title: string
  description?: string | null
  /** Canonical path, e.g. `/fashion/foo-12`. */
  path: string
  /** Already-resolved absolute OG image URL (from ogImageUrl). */
  image?: string
  type?: 'website' | 'article' | 'profile'
  publishedTime?: string | null
  modifiedTime?: string | null
  authors?: string[]
  section?: string | null
  noIndex?: boolean
  /** Explicit canonical override (post/category `seo.canonicalURL`). */
  canonicalOverride?: string | null
}

/** Build a Next Metadata object with canonical, OpenGraph, Twitter, and robots. */
export function buildMetadata(args: BuildMetaArgs): Metadata {
  const {
    title,
    description,
    path,
    image,
    type = 'website',
    publishedTime,
    modifiedTime,
    authors,
    section,
    noIndex,
    canonicalOverride,
  } = args
  const canonical = canonicalOverride || path
  const images = image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined

  return {
    title,
    description: description ?? undefined,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type,
      url: canonical,
      title,
      description: description ?? undefined,
      siteName: SITE.name,
      locale: 'ar_AR',
      images,
      ...(type === 'article'
        ? {
            publishedTime: publishedTime ?? undefined,
            modifiedTime: modifiedTime ?? undefined,
            authors,
            section: section ?? undefined,
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description ?? undefined,
      images: image ? [image] : undefined,
    },
  }
}

// ─────────────────────────── JSON-LD builders ───────────────────────────

const CONTEXT = 'https://schema.org' as const

function orgLogo(cfg: SiteConfig): string {
  return cfg.logo?.url ? absoluteUrl(cfg.logo.url) : absoluteUrl('/icon.svg')
}

export function organizationJsonLd(cfg: SiteConfig) {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: cfg.name,
    url: SITE_URL,
    logo: orgLogo(cfg),
    sameAs: cfg.social.map((s) => s.href),
  }
}

export function webSiteJsonLd(cfg: SiteConfig) {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: cfg.name,
    url: SITE_URL,
    inLanguage: 'ar',
    description: cfg.tagline,
  }
}

export function newsArticleJsonLd(post: Post, cfg: SiteConfig) {
  const url = absoluteUrl(postUrl(post))
  const category =
    post.category && typeof post.category === 'object' ? post.category : null
  const authors = (post.authors ?? [])
    .filter((a): a is Extract<typeof a, { id: number }> => typeof a === 'object')
    .map((a) => ({ '@type': 'Person', name: a.name, url: absoluteUrl(authorUrl(a.id)) }))
  const image = ogImageUrl(post.seo?.ogImage, asMedia(post.featuredImage) ?? cfg.defaultOgImage)

  return {
    '@context': CONTEXT,
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: image ? [image] : undefined,
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    inLanguage: 'ar',
    articleSection: category?.name,
    author: authors.length ? authors : { '@type': 'Organization', name: cfg.name },
    publisher: {
      '@type': 'Organization',
      name: cfg.name,
      logo: { '@type': 'ImageObject', url: orgLogo(cfg) },
    },
  }
}

/**
 * Recipe JSON-LD for kitchen posts. Emits only the fields we can produce validly:
 * prep/cook times are free-text Arabic ("20 دقيقة"), not ISO-8601 durations, so
 * they are intentionally omitted rather than emitted invalid.
 */
export function recipeJsonLd(post: Post) {
  const r = post.recipe
  if (!post.isRecipe || !r) return null
  const image = ogImageUrl(post.featuredImage)
  return {
    '@context': CONTEXT,
    '@type': 'Recipe',
    name: post.title,
    description: post.excerpt ?? undefined,
    image: image ? [image] : undefined,
    inLanguage: 'ar',
    recipeCuisine: r.cuisine ?? undefined,
    recipeYield: r.servings ?? undefined,
    recipeIngredient: (r.ingredients ?? []).map((i) => i.item),
    recipeInstructions: (r.instructions ?? []).map((s) => ({
      '@type': 'HowToStep',
      text: s.step,
    })),
  }
}

export function videoObjectJsonLd(video: Video) {
  const thumb = asMedia(video.thumbnail)
  return {
    '@context': CONTEXT,
    '@type': 'VideoObject',
    name: video.title,
    description: video.description ?? video.title,
    thumbnailUrl: thumb?.url ? [absoluteUrl(thumb.url)] : undefined,
    uploadDate: video.publishedAt ?? video.createdAt,
    contentUrl: video.videoUrl,
    embedUrl: video.videoUrl,
    inLanguage: 'ar',
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  }
}
```

- [ ] **Step 2: Write `src/components/JsonLd.tsx`**

```tsx
/**
 * Renders one JSON-LD block. Server component — `data` is a plain object from a
 * builder in `@/lib/seo`. Safe stringify (no user HTML; `<` escaped defensively).
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
```

- [ ] **Step 3: Verify types & lint**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/lib/seo.ts src/components/JsonLd.tsx`
Expected: no errors. (If `tsc` complains about a stale `.next/types` `validator.ts`, delete `.next` and rerun — see resume notes.)

- [ ] **Step 4: Checkpoint (no commit)** — confirm both files exist and typecheck. Do NOT run `git commit`.

---

## Task 2: Root layout + homepage metadata + site-wide JSON-LD

**Files:**
- Modify: `src/app/(frontend)/layout.tsx`
- Modify: `src/app/(frontend)/page.tsx`

**Interfaces:**
- Consumes: `SITE_URL`, `buildMetadata`, `ogImageUrl`, `organizationJsonLd`, `webSiteJsonLd`, `videoObjectJsonLd` from `@/lib/seo`; `<JsonLd>`; `getSiteConfig`, `getLatestVideos`, `getHomepage` from `@/lib/queries`.
- Produces: absolute canonical/OG on `/`; site-wide Organization + WebSite JSON-LD in the layout; homepage VideoObject JSON-LD.

- [ ] **Step 1: Update `src/app/(frontend)/layout.tsx`** — add `metadataBase` + default OG to the static metadata, an RSS `alternates` link, and render site-wide JSON-LD in `<body>`.

Replace the existing `export const metadata = {…}` block with:

```tsx
import type { Metadata } from 'next'
import { SITE_URL, organizationJsonLd, webSiteJsonLd, ogImageUrl } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  const image = ogImageUrl(cfg.defaultOgImage)
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: 'لالة فاطمة',
      template: '%s | لالة فاطمة',
    },
    description:
      'مجلة لالة فاطمة — مشاهير، موضة، جمال، صحة، مطبخ وأسلوب حياة للمرأة المغربية.',
    alternates: {
      canonical: '/',
      types: { 'application/rss+xml': `${SITE_URL}/rss.xml` },
    },
    openGraph: {
      type: 'website',
      url: SITE_URL,
      siteName: cfg.name,
      locale: 'ar_AR',
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
  }
}
```

(Delete the old `export const metadata = {…}` object — it is replaced by `generateMetadata` above. Keep the `Tajawal` font setup unchanged.)

Then in the `RootLayout` component, fetch config and render JSON-LD. Change the body of `RootLayout`:

```tsx
export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const cfg = await getSiteConfig()

  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="flex min-h-screen flex-col bg-white text-zinc-900">
        <JsonLd data={organizationJsonLd(cfg)} />
        <JsonLd data={webSiteJsonLd(cfg)} />
        {/* Admin-managed site-wide loaders (ad networks, GTM, verification). */}
        <SiteScripts headHtml={cfg.headScripts} bodyHtml={cfg.bodyScripts} />
        <Header />
        <AdSlot placement="header" className="mt-4 px-4" />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  )
}
```

(Note: this replaces the previous destructuring of `{ headScripts, bodyScripts }` — now read from `cfg.headScripts` / `cfg.bodyScripts` since we already have `cfg`.)

- [ ] **Step 2: Update `src/app/(frontend)/page.tsx`** — add `generateMetadata` and homepage VideoObject JSON-LD.

Add near the top (after existing imports) and before the default export:

```tsx
import type { Metadata } from 'next'
import { buildMetadata, ogImageUrl, videoObjectJsonLd } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'
import { getSiteConfig, getLatestVideos } from '@/lib/queries'

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: cfg.name,
    description: cfg.tagline,
    path: '/',
    image: ogImageUrl(cfg.defaultOgImage),
    type: 'website',
  })
}
```

Then inside the homepage component's returned JSX (top level of the returned fragment/main), render VideoObject blocks for the videos already fetched for the band. If the homepage already fetches videos, reuse them; otherwise fetch:

```tsx
  const videos = await getLatestVideos(6)
  // …existing homepage JSX…
  // Add near the top of the returned tree:
  //   {videos.map((v) => <JsonLd key={v.id} data={videoObjectJsonLd(v)} />)}
```

If `getLatestVideos` is already called in `page.tsx`, do not fetch twice — map the existing array. Confirm by reading the current `page.tsx` before editing.

- [ ] **Step 3: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/app/\(frontend\)/layout.tsx src/app/\(frontend\)/page.tsx`
Expected: no errors.

- [ ] **Step 4: Checkpoint (no commit).**

---

## Task 3: Article page — metadata + Article/Recipe/Breadcrumb JSON-LD

**Files:**
- Modify: `src/app/(frontend)/[category]/[slug]/page.tsx`

**Interfaces:**
- Consumes: `buildMetadata`, `ogImageUrl`, `newsArticleJsonLd`, `recipeJsonLd`, `breadcrumbJsonLd` from `@/lib/seo`; `<JsonLd>`; `getSiteConfig` from `@/lib/queries`; `postUrl`, `categoryUrl` from `@/lib/routes`.
- Produces: full article `<head>` + JSON-LD.

- [ ] **Step 1: Replace `generateMetadata` and augment the page** in `[category]/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleView } from '@/components/ArticleView'
import { JsonLd } from '@/components/JsonLd'
import { getPostById, getRelatedPosts, getSiteConfig } from '@/lib/queries'
import { idFromSlugParam, postUrl, categoryUrl } from '@/lib/routes'
import {
  buildMetadata,
  ogImageUrl,
  newsArticleJsonLd,
  recipeJsonLd,
  breadcrumbJsonLd,
} from '@/lib/seo'

export const revalidate = 3600

type Props = { params: Promise<{ category: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  const post = id ? await getPostById(id) : null
  if (!post) return {}
  const cfg = await getSiteConfig()
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const authorNames = (post.authors ?? [])
    .filter((a): a is Extract<typeof a, { id: number }> => typeof a === 'object')
    .map((a) => a.name)
  return buildMetadata({
    title: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    path: postUrl(post),
    image: ogImageUrl(post.seo?.ogImage, cfg.defaultOgImage) ?? ogImageUrl(post.featuredImage, cfg.defaultOgImage),
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: authorNames,
    section: category?.name,
    noIndex: post.seo?.noIndex ?? false,
    canonicalOverride: post.seo?.canonicalURL,
  })
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  if (!id) notFound()

  const post = await getPostById(id)
  if (!post) notFound()

  const [related, cfg] = await Promise.all([getRelatedPosts(post, 4), getSiteConfig()])
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const recipe = recipeJsonLd(post)

  const crumbs = [
    { name: 'الرئيسية', url: '/' },
    ...(category ? [{ name: category.name, url: categoryUrl(category.slug ?? '') }] : []),
    { name: post.title, url: postUrl(post) },
  ]

  return (
    <>
      <JsonLd data={newsArticleJsonLd(post, cfg)} />
      {recipe && <JsonLd data={recipe} />}
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <ArticleView post={post} related={related} />
    </>
  )
}
```

- [ ] **Step 2: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint "src/app/(frontend)/[category]/[slug]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Checkpoint (no commit).**

---

## Task 4: Category SEO field (migration) + category page metadata + breadcrumb

**Files:**
- Modify: `src/collections/Categories.ts`
- Create: migration (auto-generated)
- Modify: `src/payload-types.ts` (regenerated)
- Modify: `src/app/(frontend)/[category]/page.tsx`

**Interfaces:**
- Consumes: `seoField` from `@/fields/seo`; `buildMetadata`, `ogImageUrl`, `breadcrumbJsonLd` from `@/lib/seo`; `getSiteConfig` from `@/lib/queries`.
- Produces: `Category.seo` group in types; category metadata + Breadcrumb JSON-LD.

- [ ] **Step 1: Add `seoField` to `src/collections/Categories.ts`.** Add the import and append the field:

```ts
import { seoField } from '../fields/seo'
```

Then change the `fields` array's tail from:

```ts
    slugField('name'),
  ],
```
to:
```ts
    slugField('name'),
    seoField,
  ],
```

- [ ] **Step 2: Create and apply the migration.**

Run: `npx pnpm@10.18.0 exec payload migrate:create add_category_seo`
Expected: a new file under `src/migrations/` (e.g. `<timestamp>_add_category_seo.ts` + `.json`) adding the `categories.seo_*` columns. Open it and confirm it only adds columns to `categories` (meta_title, meta_description, og_image_id, canonical_url, no_index) — no destructive statements.

Run: `npx pnpm@10.18.0 exec payload migrate`
Expected: `Done.` — migration applied to Neon.

- [ ] **Step 3: Regenerate types.**

Run: `npx pnpm@10.18.0 exec payload generate:types`
Expected: `src/payload-types.ts` updated; `Category` now has an optional `seo` group matching the Post/Video shape.

- [ ] **Step 4: Update `src/app/(frontend)/[category]/page.tsx`** — richer metadata + breadcrumb JSON-LD:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getCategories, getCategoryBySlug, getPosts, getSiteConfig } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl, breadcrumbJsonLd } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.filter((c) => c.slug).map((c) => ({ category: c.slug as string }))
}

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return {}
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
```

Then in the `CategoryPage` component, add the breadcrumb JSON-LD right after `if (!category) notFound()`:

```tsx
  const crumbs = [
    { name: 'الرئيسية', url: '/' },
    { name: category.name, url: categoryUrl(category.slug ?? slug) },
  ]
```
and render `<JsonLd data={breadcrumbJsonLd(crumbs)} />` as the first child inside the returned `<main>`.

- [ ] **Step 5: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint "src/app/(frontend)/[category]/page.tsx" src/collections/Categories.ts`
Expected: no errors.

- [ ] **Step 6: Checkpoint (no commit).**

---

## Task 5: Author page metadata

**Files:**
- Modify: `src/app/(frontend)/author/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildMetadata`, `ogImageUrl` from `@/lib/seo`; `getSiteConfig`, `getAuthorById` from `@/lib/queries`; `authorUrl` from `@/lib/routes`.

- [ ] **Step 1: Replace `generateMetadata`** in `author/[id]/page.tsx`:

```tsx
import { buildMetadata, ogImageUrl } from '@/lib/seo'
import { getAuthorById, getPostsByAuthor, getSiteConfig } from '@/lib/queries'
import { authorUrl } from '@/lib/routes'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const author = await getAuthorById(Number(id))
  if (!author) return {}
  const cfg = await getSiteConfig()
  const title = author.title ? `${author.name} — ${author.title}` : author.name
  return buildMetadata({
    title,
    description: author.bio,
    path: authorUrl(author.id),
    image: ogImageUrl(author.avatar, cfg.defaultOgImage),
    type: 'profile',
  })
}
```

(Keep the rest of the file unchanged; ensure `getSiteConfig` is added to the existing `@/lib/queries` import.)

- [ ] **Step 2: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint "src/app/(frontend)/author/[id]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Checkpoint (no commit).**

---

## Task 6: Sitemap + Google News sitemap route handlers

**Files:**
- Create: `src/app/(frontend)/sitemap.xml/route.ts`
- Create: `src/app/(frontend)/news-sitemap.xml/route.ts`

**Interfaces:**
- Consumes: `getPayloadClient` from `@/lib/payload`; `SITE_URL`, `absoluteUrl` from `@/lib/seo`; `postUrl`, `categoryUrl` from `@/lib/routes`; `SITE` from `@/lib/site`.
- Produces: `/sitemap.xml`, `/news-sitemap.xml`.

- [ ] **Step 1: Write `src/app/(frontend)/sitemap.xml/route.ts`**

```ts
import { getPayloadClient } from '@/lib/payload'
import { SITE_URL, absoluteUrl } from '@/lib/seo'
import { postUrl, categoryUrl, authorUrl } from '@/lib/routes'

export const revalidate = 3600

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function urlTag(loc: string, lastmod?: string) {
  return `<url><loc>${escape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
}

export async function GET() {
  const payload = await getPayloadClient()

  const [posts, categories, authors] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 2000,
      depth: 1,
    }),
    payload.find({ collection: 'categories', limit: 200, depth: 0 }),
    payload.find({ collection: 'users', limit: 200, depth: 0 }),
  ])

  const urls: string[] = [urlTag(SITE_URL)]

  for (const c of categories.docs) {
    if (c.slug) urls.push(urlTag(absoluteUrl(categoryUrl(c.slug))))
  }
  for (const a of authors.docs) {
    urls.push(urlTag(absoluteUrl(authorUrl(a.id))))
  }
  for (const p of posts.docs) {
    urls.push(urlTag(absoluteUrl(postUrl(p)), (p.updatedAt || p.publishedAt || undefined) ?? undefined))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
```

- [ ] **Step 2: Write `src/app/(frontend)/news-sitemap.xml/route.ts`**

```ts
import { getPayloadClient } from '@/lib/payload'
import { absoluteUrl } from '@/lib/seo'
import { postUrl } from '@/lib/routes'
import { SITE } from '@/lib/site'

export const revalidate = 600

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET() {
  const payload = await getPayloadClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { docs } = await payload.find({
    collection: 'posts',
    where: {
      and: [{ _status: { equals: 'published' } }, { publishedAt: { greater_than_equal: cutoff } }],
    },
    sort: '-publishedAt',
    limit: 1000,
    depth: 1,
  })

  const items = docs
    .map((p) => {
      const pub = p.publishedAt || p.createdAt
      return `<url><loc>${escape(absoluteUrl(postUrl(p)))}</loc><news:news><news:publication><news:name>${escape(
        SITE.name,
      )}</news:name><news:language>ar</news:language></news:publication><news:publication_date>${pub}</news:publication_date><news:title>${escape(
        p.title,
      )}</news:title></news:news></url>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${items}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
```

- [ ] **Step 3: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint "src/app/(frontend)/sitemap.xml/route.ts" "src/app/(frontend)/news-sitemap.xml/route.ts"`
Expected: no errors.

- [ ] **Step 4: Checkpoint (no commit).**

---

## Task 7: robots.txt + RSS + llms.txt

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/(frontend)/rss.xml/route.ts`
- Create: `src/app/(frontend)/llms.txt/route.ts`

**Interfaces:**
- Consumes: `SITE_URL`, `absoluteUrl`, `ogImageUrl` from `@/lib/seo`; `getPayloadClient`, `getSiteConfig`, `getCategories`, `getLatestPosts` from `@/lib/queries`; `postUrl`, `categoryUrl` from `@/lib/routes`.
- Produces: `/robots.txt`, `/rss.xml`, `/llms.txt`.

- [ ] **Step 1: Write `src/app/robots.ts`**

```ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/preview'] },
      // Explicitly welcome AI crawlers so the magazine is citable by AI search.
      ...AI_BOTS.map((ua) => ({ userAgent: ua, allow: '/' })),
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  }
}
```

- [ ] **Step 2: Write `src/app/(frontend)/rss.xml/route.ts`**

```ts
import { getLatestPosts, getSiteConfig } from '@/lib/queries'
import { SITE_URL, absoluteUrl, ogImageUrl } from '@/lib/seo'
import { postUrl } from '@/lib/routes'

export const revalidate = 900

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export async function GET() {
  const [posts, cfg] = await Promise.all([getLatestPosts(20), getSiteConfig()])

  const items = posts
    .map((p) => {
      const link = absoluteUrl(postUrl(p))
      const pub = new Date(p.publishedAt || p.createdAt).toUTCString()
      const img = ogImageUrl(p.featuredImage, cfg.defaultOgImage)
      const cat = p.category && typeof p.category === 'object' ? p.category.name : ''
      return `<item><title>${escape(p.title)}</title><link>${escape(link)}</link><guid isPermaLink="true">${escape(
        link,
      )}</guid>${cat ? `<category>${escape(cat)}</category>` : ''}<pubDate>${pub}</pubDate><description>${escape(
        p.excerpt ?? '',
      )}</description>${img ? `<media:content url="${escape(img)}" medium="image"/>` : ''}</item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n<channel>\n<title>${escape(
    cfg.name,
  )}</title>\n<link>${SITE_URL}</link>\n<description>${escape(
    cfg.tagline,
  )}</description>\n<language>ar</language>\n${items}\n</channel>\n</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
```

- [ ] **Step 3: Write `src/app/(frontend)/llms.txt/route.ts`**

```ts
import { getCategories, getLatestPosts, getSiteConfig } from '@/lib/queries'
import { absoluteUrl } from '@/lib/seo'
import { postUrl, categoryUrl } from '@/lib/routes'

export const revalidate = 3600

export async function GET() {
  const [cfg, categories, posts] = await Promise.all([
    getSiteConfig(),
    getCategories(),
    getLatestPosts(20),
  ])

  const lines: string[] = [
    `# ${cfg.name}`,
    '',
    `> ${cfg.tagline}`,
    '',
    'مجلة لالة فاطمة موقع إخباري مغربي موجّه للمرأة، يغطي المشاهير والموضة والجمال والصحة والمطبخ وأسلوب الحياة باللغة العربية.',
    '',
    '## الأقسام',
    '',
    ...categories
      .filter((c) => c.slug)
      .map((c) => `- [${c.name}](${absoluteUrl(categoryUrl(c.slug as string))})`),
    '',
    '## أحدث المقالات',
    '',
    ...posts.map((p) => `- [${p.title}](${absoluteUrl(postUrl(p))})`),
    '',
  ]

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

- [ ] **Step 4: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/app/robots.ts "src/app/(frontend)/rss.xml/route.ts" "src/app/(frontend)/llms.txt/route.ts"`
Expected: no errors.

- [ ] **Step 5: Checkpoint (no commit).**

---

## Task 8: Redirects collection + migration + registration + map route

**Files:**
- Create: `src/collections/Redirects.ts`
- Modify: `src/hooks/revalidate.ts`
- Modify: `src/payload.config.ts`
- Create: migration (auto-generated)
- Modify: `src/payload-types.ts` (regenerated)
- Create: `src/app/(frontend)/redirects-map.json/route.ts`

**Interfaces:**
- Consumes: `anyone`, `isAdminOrEditor` from `../access`; `revalidatePath` from `next/cache`.
- Produces: `redirects` collection; `revalidateRedirects` hook; `/redirects-map.json` returning `Record<string, { to: string; type: number }>`.

- [ ] **Step 1: Add a redirect-map revalidation hook to `src/hooks/revalidate.ts`.** Append:

```ts
export const revalidateRedirects: CollectionAfterChangeHook = ({ doc }) => {
  try {
    revalidatePath('/redirects-map.json')
  } catch {
    /* outside request scope — ignore */
  }
  revalidateSite()
  return doc
}

export const revalidateRedirectsAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  try {
    revalidatePath('/redirects-map.json')
  } catch {
    /* ignore */
  }
  revalidateSite()
  return doc
}
```

- [ ] **Step 2: Write `src/collections/Redirects.ts`**

```ts
import type { CollectionConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { revalidateRedirects, revalidateRedirectsAfterDelete } from '../hooks/revalidate'

/**
 * Admin-editable 301/302 redirects — groundwork for the Phase 7 WordPress map.
 * Served at request time by `src/middleware.ts` via the cached `/redirects-map.json`
 * route. Exact-path matching only for now (wildcards/regex arrive in Phase 7).
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: 'إعادة توجيه', plural: 'إعادات التوجيه' },
  admin: {
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'type', 'active'],
    group: 'الإعدادات',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateRedirects],
    afterDelete: [revalidateRedirectsAfterDelete],
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      label: 'من (المسار القديم)',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'المسار فقط، يبدأ بشرطة مائلة. مثال: /old-article-123' },
    },
    {
      name: 'to',
      type: 'text',
      label: 'إلى (الوجهة)',
      required: true,
      admin: { description: 'مسار داخلي (/new) أو رابط كامل.' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'النوع',
      defaultValue: '301',
      options: [
        { label: '301 (دائم)', value: '301' },
        { label: '302 (مؤقت)', value: '302' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'مُفعّل',
      defaultValue: true,
    },
  ],
}
```

- [ ] **Step 3: Register the collection in `src/payload.config.ts`.** Add the import:

```ts
import { Redirects } from './collections/Redirects'
```
and add `Redirects` to the `collections` array (place after `Ads`, before `Media`):

```ts
  collections: [Posts, Categories, Tags, Videos, MagazineIssues, Pages, Ads, Redirects, Media, Users],
```

- [ ] **Step 4: Create and apply the migration.**

Run: `npx pnpm@10.18.0 exec payload migrate:create add_redirects`
Expected: a migration creating the `redirects` table. Open it; confirm it only creates the table + enum for `type` and a unique index on `from`.

Run: `npx pnpm@10.18.0 exec payload migrate`
Expected: `Done.`

- [ ] **Step 5: Regenerate types.**

Run: `npx pnpm@10.18.0 exec payload generate:types`
Expected: `Redirect` interface added to `src/payload-types.ts`.

- [ ] **Step 6: Write `src/app/(frontend)/redirects-map.json/route.ts`**

```ts
import { getPayloadClient } from '@/lib/payload'

export const revalidate = 300

/** Cached exact-match redirect map consumed by middleware. */
export async function GET() {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { active: { equals: true } },
    limit: 5000,
    depth: 0,
  })

  const map: Record<string, { to: string; type: number }> = {}
  for (const r of docs) {
    if (r.from && r.to) map[r.from] = { to: r.to, type: r.type === '302' ? 302 : 301 }
  }

  return Response.json(map)
}
```

- [ ] **Step 7: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/collections/Redirects.ts src/payload.config.ts src/hooks/revalidate.ts "src/app/(frontend)/redirects-map.json/route.ts"`
Expected: no errors.

- [ ] **Step 8: Checkpoint (no commit).**

---

## Task 9: Middleware — request-time redirects

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `/redirects-map.json` (fetched at request time).
- Produces: 301/302 responses for matching paths.

- [ ] **Step 1: Write `src/middleware.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type RedirectMap = Record<string, { to: string; type: number }>

/**
 * Exact-path 301/302 redirects, sourced from the admin-editable Redirects collection
 * via the cached `/redirects-map.json` route. Kept deliberately small (groundwork);
 * wildcard/regex matching and the bulk WordPress map land in Phase 7. Any failure to
 * load the map falls through to `next()` so a redirect glitch never takes the site down.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  try {
    const res = await fetch(new URL('/redirects-map.json', req.url), {
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const map = (await res.json()) as RedirectMap
      const hit = map[pathname]
      if (hit) {
        return NextResponse.redirect(new URL(hit.to, req.url), hit.type)
      }
    }
  } catch {
    /* map unavailable — serve normally */
  }
  return NextResponse.next()
}

// Skip admin, api, Next internals, the map route itself, and any file with an extension.
export const config = {
  matcher: ['/((?!admin|api|_next|redirects-map).*)'],
}
```

Note: the matcher excludes `redirects-map` and paths with a dot are naturally not redirected because the map only contains DB `from` values. The `.json` route is excluded by name to avoid a self-fetch loop.

- [ ] **Step 2: Verify** — `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint src/middleware.ts`
Expected: no errors.

- [ ] **Step 3: Checkpoint (no commit).**

---

## Task 10: Full verification + docs/memory update

**Files:**
- Modify: `PLAN.md` (mark Phase 4 done)
- Modify: memory (`phase-progress.md`, `MEMORY.md`)

- [ ] **Step 1: Type + lint gate.**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .`
Expected: clean.

- [ ] **Step 2: Production build.**

Run: `npx pnpm@10.18.0 build`
Expected: build succeeds; `/sitemap.xml`, `/news-sitemap.xml`, `/rss.xml`, `/llms.txt`, `/redirects-map.json`, `robots.txt` appear as routes; middleware compiled.

- [ ] **Step 3: Start dev and check feed/route outputs.**

Start dev in the background: `npx pnpm@10.18.0 dev` (kill stale listeners on 3000–3002 first).
Then fetch and eyeball each:

```bash
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml | head -20
curl -s http://localhost:3000/news-sitemap.xml | head -20
curl -s http://localhost:3000/rss.xml | head -20
curl -s http://localhost:3000/llms.txt | head -30
curl -s http://localhost:3000/redirects-map.json
```
Expected: robots.txt lists both sitemaps + AI bots; sitemap/news/rss are well-formed XML with absolute `https://lallafatema.ma` (or dev origin) URLs; llms.txt is Markdown with الأقسام + أحدث المقالات; map is `{}` (no redirects yet).

- [ ] **Step 4: Playwright — assert metadata + JSON-LD on a real article.**

Use the Playwright MCP (or `@playwright/test`) to load an article URL (from the homepage), then assert in the page:
- `document.querySelector('link[rel=canonical]')?.href` is absolute.
- `document.querySelector('meta[property="og:title"]')` exists; `meta[name="twitter:card"]` = `summary_large_image`.
- Every `script[type="application/ld+json"]` parses as JSON; collect `@type` values and assert the set includes `Organization`, `WebSite`, `NewsArticle`, `BreadcrumbList` (and `Recipe` on a recipe post).

Example assertion snippet to run via `browser_evaluate`:

```js
() => {
  const types = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => { try { return JSON.parse(s.textContent)['@type'] } catch { return 'INVALID' } })
  const canonical = document.querySelector('link[rel=canonical]')?.href
  return { types, canonical, ogTitle: !!document.querySelector('meta[property="og:title"]') }
}
```
Expected: no `INVALID`; expected `@type`s present; `canonical` starts with `http`.

- [ ] **Step 5: Playwright — verify a redirect end-to-end.**

Log into `/admin` (`dev@lallafatema.ma` / `DevAdmin!2026`), create a Redirect (`from: /seo-test-redirect`, `to: /`, `type: 301`, active). Then navigate to `http://localhost:3000/seo-test-redirect` and assert the browser lands on `/` (301 followed). Delete the test redirect afterward.

- [ ] **Step 6: Confirm no `/_next/image` requests.** In the Playwright network log for the article page, assert zero requests to `/_next/image` (the Cloudflare-loader rule still holds).

- [ ] **Step 7: Update `PLAN.md`** — mark Phase 4 delivered (metadata, JSON-LD, sitemaps incl. News, RSS, llms.txt, related articles confirmed, redirect groundwork). Note what deferred to Phase 6/7 (SearchAction, per-video pages, bulk redirect map, sitemap pagination).

- [ ] **Step 8: Update memory** — edit `phase-progress.md`: move Phase 4 to done with a concise record (files added, decisions, migrations `add_category_seo` + `add_redirects` applied to Neon); set NEXT to Phase 5 (Ads & consent — note ads slots already partly built in the dashboard work). Update `MEMORY.md` index line.

- [ ] **Step 9: Final report (no commit).** Summarize for the user: everything verified, all changes (Phase 4 + the pre-existing uncommitted dashboard tree) remain uncommitted. Ask whether to commit Phase 4 (and how to handle the dashboard changes).

---

## Self-Review Notes (author)

- **Spec coverage:** metadata (Tasks 2–5) ✓; JSON-LD Article/Recipe/Video/Breadcrumb/Org/WebSite (Tasks 1–3, 2) ✓; sitemaps + News (Task 6) ✓; robots + RSS + llms.txt (Task 7) ✓; related articles (confirmed in Task 10 Step 4, no code change — already wired) ✓; Category SEO migration (Task 4) ✓; Redirects collection + middleware (Tasks 8–9) ✓; base URL resolver (Task 1) ✓.
- **Deferred (per spec):** WebSite SearchAction + per-video pages → Phase 6; bulk redirect map + sitemap pagination → Phase 7.
- **Type consistency:** `buildMetadata` args, `ogImageUrl` fallback signature, and JSON-LD builder names are used identically across Tasks 2–7. `revalidateRedirects` / `revalidateRedirectsAfterDelete` defined in Task 8 Step 1 and referenced in Step 2.
- **Known tradeoff:** middleware fetches the cached map route per request (acceptable for tiny groundwork maps; Phase 7 can optimize). Fail-open on any error.
