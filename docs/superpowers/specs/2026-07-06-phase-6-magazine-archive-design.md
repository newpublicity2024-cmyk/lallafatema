# Phase 6 (sub-project 1) — Magazine Archive — Design

**Project:** Lalla Fatema (Arabic RTL women's magazine) — Next.js 16 (App Router) + Payload CMS 3.85 + Neon Postgres.
**Date:** 2026-07-06
**Status:** Approved — ready for implementation plan.

## Goal

Give readers a public **magazine archive**: browse all published digital issues and read/download each
issue's PDF. Two routes — a cover-grid listing (`/magazine`) and a per-issue page
(`/magazine/[issueNumber]`) with a cover **facade** that loads a native PDF viewer only on demand
(CWV-safe) plus a download link. RTL/Arabic throughout, ISR, per-page SEO + JSON-LD, sitemap entries.
No schema changes — the `magazine-issues` collection already holds everything needed.

Phase 6 is five independent sub-projects (search, archive, per-video pages, newsletter, push); **this
spec covers only the magazine archive.** The credential-gated ones (Meilisearch, Brevo, OneSignal)
come later as creds arrive.

## Confirmed decisions

| Topic | Decision |
|---|---|
| PDF rendering | **Cover facade → native `<iframe>` viewer.** Show cover + read/download buttons; the (large) PDF loads only when the reader clicks "قراءة العدد". Mirrors the existing video-facade pattern → zero CWV cost, no JS PDF dependency. |
| Issue URL scheme | **`/magazine/[issueNumber]`** (e.g. `/magazine/167`). `issueNumber` is unique + required + meaningful — no separate slug field needed. |
| Archive listing | Responsive RTL grid of portrait cover cards, newest first (`-issueNumber`), published only. |
| Download | Open `<a href={pdf.url} download>` — no gating, no tracking. |
| JSON-LD | **`PublicationIssue`** per issue (issueNumber, datePublished, image, `isPartOf` a `Periodical` "لالة فاطمة", `associatedMedia` = the PDF as a `MediaObject`). |
| Nav | Add a **"المجلة"** entry linking to `/magazine` via the Header menu fallback (admin can also add/override it through the Main Menu global). |
| Schema changes | **None.** `magazine-issues` + `media` already support this. |

## Current-state facts (verified against code)

- **`magazine-issues` collection** (`src/collections/MagazineIssues.ts`): fields `issueNumber` (number,
  **unique**, required), `title` (text), `publishDate` (date), `cover` (upload→media, required), `pdf`
  (upload→media, required — admin note already says *"displayed in-page with a download button, stored
  in R2"*), `description` (textarea). `versions.drafts: true`; `access.read: canReadPublished`;
  `defaultSort: '-issueNumber'`; `afterChange/afterDelete: revalidate*` hooks already wired.
- **`media` collection** accepts `mimeTypes: ['image/*', 'application/pdf']` — PDFs upload fine and
  expose `.url` (R2 when `R2_*` configured, else local). Cover images go through the custom Cloudflare
  `next/image` loader; **the PDF is served directly from `pdf.url`, never through the image loader.**
- **No `/magazine`, `/video`, or `/search` routes exist yet.**
- **`src/lib/routes.ts`** holds URL builders (`categoryUrl`, `postUrl`, `authorUrl`, `idFromSlugParam`).
  No magazine helpers yet.
- **`src/lib/seo.ts`** provides `SITE_URL`, `absoluteUrl`, `ogImageUrl`, `buildMetadata`, and JSON-LD
  builders + `<JsonLd>` — the same utilities article/category pages use. A new `publicationIssueJsonLd`
  builder slots in here.
- **`src/app/(frontend)/sitemap.xml/route.ts`** is a GET handler building `<url>` tags via `urlTag` +
  `absoluteUrl`; currently lists homepage, categories, authors, posts. Magazine URLs get appended here.
- **Main Menu** (`src/globals/MainMenu.ts`) is an admin-managed `items` array (`label` + `category`
  relationship + custom `url`), consumed by the Header with constant fallbacks.
- Existing pages establish the pattern: server components, `export const revalidate = 3600`,
  `generateMetadata` via `buildMetadata`, `.lf-container`, RTL, `next/image` covers, `notFound()` for
  missing/unpublished docs, published-only queries in `src/lib/queries.ts`.

## Architecture

### 1. URL helpers — `src/lib/routes.ts`

- `magazineArchiveUrl(): string` → `'/magazine'`.
- `magazineIssueUrl(issue: Pick<MagazineIssue,'issueNumber'>): string` → `/magazine/${issue.issueNumber}`.
- `issueNumberFromParam(param: string): number | null` → `Number` if `/^\d+$/`, else `null` (guards the
  dynamic route against non-numeric input → `404`).

### 2. Queries — `src/lib/queries.ts`

- `getMagazineIssues(): Promise<MagazineIssue[]>` — `payload.find({ collection:'magazine-issues',
  where:{ _status:{ equals:'published' } }, sort:'-issueNumber', depth:1, limit:200 })` → `.docs`.
  `depth:1` populates `cover` for the grid.
- `getMagazineIssueByNumber(n: number): Promise<MagazineIssue | null>` — `payload.find(... where:{ and:[
  { issueNumber:{ equals:n } }, { _status:{ equals:'published' } } ] }, depth:1, limit:1 })` →
  `docs[0] ?? null`. `depth:1` populates both `cover` and `pdf`.

(Published-only filter in the query — the Local API bypasses access control, same pattern as the
existing post queries.)

### 3. Archive listing — `src/app/(frontend)/magazine/page.tsx`

Server component, `revalidate = 3600`. Fetches `getMagazineIssues()`, renders a section heading
("أعداد المجلة") + responsive grid of `<IssueCard>`; empty-state ("لا توجد أعداد بعد") when none.
`generateMetadata` → title "أرشيف المجلة" + description + default OG.

### 4. Issue card — `src/components/IssueCard.tsx`

Presentational. Portrait cover (`next/image`, Cloudflare loader, fixed aspect e.g. 3/4), title,
"العدد {issueNumber}", Arabic-formatted `publishDate`. Whole card links to `magazineIssueUrl(issue)`.
Follows the existing `.lf-card` styling (block anchors, `flex flex-col`) so grid rows don't collapse.

### 5. Issue detail — `src/app/(frontend)/magazine/[issueNumber]/page.tsx`

Server component, `revalidate = 3600`. `issueNumberFromParam(params.issueNumber)`; `null` or
missing/unpublished issue → `notFound()`. Renders: breadcrumb (الرئيسية / المجلة / العدد N), cover +
title + "العدد N" + Arabic date + `description`, then `<PdfFacade pdfUrl={pdf.url} coverUrl={cover.url}
title={…} />`. Emits `<JsonLd data={publicationIssueJsonLd(issue)} />`. `generateMetadata` → title, the
`description`, and the cover as OG image (via `ogImageUrl`).

### 6. PDF facade — `src/components/PdfFacade.tsx`

`'use client'`. Initial state shows the cover with two buttons: **قراءة العدد** (read) and **تحميل PDF**
(download, `<a href={pdfUrl} download rel="noopener">`). Clicking *read* sets state → renders a native
`<iframe src={pdfUrl} className="h-[80vh] w-full" title={…}>` (height-reserved so no CLS on swap). The
PDF is fetched by the browser only after the click → off the critical path. Reduced-motion friendly;
buttons keyboard-accessible.

### 7. SEO — `src/lib/seo.ts` + `sitemap.xml`

- `publicationIssueJsonLd(issue)` — returns a `PublicationIssue` object: `name`, `issueNumber`,
  `datePublished` (publishDate), `image` (absolute cover URL), `isPartOf` `{ '@type':'Periodical',
  name:'لالة فاطمة' }`, `associatedMedia` `{ '@type':'MediaObject', contentUrl: absolute pdf.url,
  encodingFormat:'application/pdf' }`.
- `sitemap.xml/route.ts` — also fetch published `magazine-issues` (depth 0) and append the `/magazine`
  index + each `/magazine/{issueNumber}` (lastmod = `updatedAt`).

### 8. Nav — Header

The Header builds `items` from the admin Main Menu, else falls back to top-level categories (there is
no constant menu list). To make the archive reachable out of the box regardless of that choice,
**append a constant `{ label: 'المجلة', href: '/magazine', children: [] }` to the computed `items`
array** in `src/components/Header.tsx` (after the menu-or-categories mapping). The admin can still add
their own magazine entry via the Main Menu global — the constant one is a guaranteed floor, not a
replacement.

## Files

| File | Change |
|---|---|
| `src/lib/routes.ts` | + `magazineArchiveUrl`, `magazineIssueUrl`, `issueNumberFromParam` |
| `src/lib/queries.ts` | + `getMagazineIssues`, `getMagazineIssueByNumber` |
| `src/app/(frontend)/magazine/page.tsx` | **New.** Archive listing + metadata |
| `src/app/(frontend)/magazine/[issueNumber]/page.tsx` | **New.** Issue detail + metadata + JSON-LD |
| `src/components/IssueCard.tsx` | **New.** Cover card |
| `src/components/PdfFacade.tsx` | **New.** `'use client'` facade → native iframe + download |
| `src/lib/seo.ts` | + `publicationIssueJsonLd` |
| `src/app/(frontend)/sitemap.xml/route.ts` | Append magazine index + issue URLs |
| `src/components/Header.tsx` | Append constant "المجلة" → `/magazine` nav item to `items` |
| `tests/int/routes.int.spec.ts` | **New.** Unit tests for the routes helpers |
| `tests/e2e/magazine.e2e.spec.ts` | **New.** Archive → issue → facade/download flow |

## Verification

- `tsc --noEmit` + `eslint .` + `pnpm build` clean; `/magazine` and a sample `/magazine/[issueNumber]`
  render statically (ISR).
- Vitest: `magazineIssueUrl` builds `/magazine/167`; `issueNumberFromParam` parses `"167"`→167 and
  rejects `"abc"`/`"1a"`→null.
- Playwright (dev server, RTL): `/magazine` lists issue cards → click a cover → issue page shows cover +
  title + both buttons; clicking **قراءة العدد** mounts the `<iframe>` with the PDF URL; the download
  link points at `pdf.url`. (Requires ≥1 published issue with a cover + PDF — seed one if the DB has
  none.)
- Confirm zero `/_next/image` requests for the cover (Cloudflare loader) and no CLS when the iframe
  mounts (height reserved).
- Spot-check the issue's `PublicationIssue` JSON-LD parses.

## Out of scope (this sub-project)

- Meilisearch search, per-video watch pages, Brevo newsletter, OneSignal push — separate Phase 6
  sub-projects (three gated on credentials).
- PDF.js / custom page-flip reader, in-PDF text search, per-page thumbnails.
- Download gating, auth, or analytics on downloads.
- A dedicated `Periodical`/magazine landing beyond the archive grid.

## Deferred ideas (noted, not lost)

- Pagination / "load more" on the archive if issue count grows large (v1 lists all published; fine for
  the expected volume).
- Featured/latest-issue callout on the homepage.
- `issueNumber`-based redirects from any legacy WordPress magazine URLs → Phase 7 migration.

---
*Phase: 06-magazine-archive*
*Design gathered: 2026-07-06*
