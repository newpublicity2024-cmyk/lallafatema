# Homepage Magazine Section + Magazine Import — Design

**Date:** 2026-07-14
**Scope:** A new magazine section on the homepage (between موضة and جمال), a light
polish of the `/magazine` archive, and a one-time importer that loads the 20 real
issues from `magazines/` into the existing `magazine-issues` collection.

## Problem / Goal

The `magazine-issues` collection, the `/magazine` archive, the issue reader
(`PdfFacade`), and `IssueCard` already exist, but the magazine has **no presence on
the homepage** and the archive holds only a demo issue (#999). The user is adding
~20 real issues and wants them (1) well displayed on `/magazine` and (2) surfaced in
a **stylish homepage section placed between the موضة (fashion) and جمال (beauty)
sections**, matching the Lalla Fatema design on both desktop and mobile.

## Approved design decisions

- **Section style:** full-bleed **dark premium band** (`lf-band-dark`, #23112c) so it
  stands out between the two lighter sibling sections.
- **Layout:** a **row of covers / carousel** — reuses the existing `Carousel`
  (mobile swipe + desktop grid, single responsive DOM) exactly like every other
  section.
- **Heading:** **«مجلة لالة فاطمة»** with a «المزيد ←» pill linking to `/magazine`.
- **Covers per issue:** portrait cover images, generated from **page 1 of each PDF**
  (the folder ships PDFs only — no separate cover images).

## Homepage placement (the crux)

The homepage sections are **data-driven**: `page.tsx` pulls the featured category
out as a `LeadListBlock` and renders the rest as alternating-band `SectionBlock`s in
category order (default seed order: news → **fashion → beauty** → health → …). So
"between موضة and جمال" means **injecting the magazine band right after the
`fashion` section** in that loop.

To keep this robust to admin reordering and testable, the placement decision is a
**pure helper** `magazineInsertAfterIndex(slugs: string[])`:

- returns the index of the `fashion` section if present (insert after it);
- else `beautyIndex - 1` if `beauty` is present (insert immediately before جمال);
- else `slugs.length - 1` (append after the last section).

`page.tsx` renders `<MagazineSection>` after the section at that index (and, when the
index is `-1`, before the first section). The section renders **nothing** when there
are zero published issues.

## Components

- **New `MagazineSection.tsx`** (server component): `<section className="lf-band-dark">`
  → `lf-container` → `SectionHeading` (`light`, title «مجلة لالة فاطمة», href
  `/magazine`) → `<Carousel dotColor="light" trackClassName="md:grid-cols-6">` of
  `IssueCard variant="shelf"`. Shows the newest 6 issues.
- **Changed `IssueCard.tsx`**: add `variant?: 'card' | 'shelf'` (default `'card'` —
  the current white archive card, unchanged). `'shelf'` renders the cover floating on
  the dark band: rounded cover with a subtle `ring-white/10` + soft shadow +
  hover-scale, title in white and date in `white/60` beneath (no white card box).
- **Changed `page.tsx`**: fetch `getLatestMagazineIssues(6)`, compute the insert
  index from the standard sections' slugs, render `<MagazineSection>` inline.
- **Changed `magazine/page.tsx`** (light polish): a one-line intro subtitle under the
  heading and `lg:grid-cols-5` so 20 issues lay out as tidy rows. `IssueCard` (white
  card) stays — correct on the white archive page.
- **New query `getLatestMagazineIssues(limit)`** in `queries.ts` (lean; the existing
  `getMagazineIssues` fetches up to 200).

## Data / import

Source: `magazines/` (git-ignored). `index.json` lists 20 entries `n`=01..20 with the
local PDF `file` and the original article URL. Verified mapping from three URLs that
carry explicit issue numbers (n18→العدد 150, n19→149, n20→148):

> **issueNumber = 168 − n**  → n01 = 167 … n20 = 148 (a clean consecutive run).

Importer `src/seed/import-magazines.ts` (idempotent, `--dry-run` supported):

1. For each entry: derive `issueNumber = 168 - n`, `title = «العدد {issueNumber}»`.
2. Generate the cover from **PDF page 1** → an image buffer, upload to `media`
   (required `alt`).
3. Upload the PDF to `media`.
4. Upsert the `magazine-issues` doc by `issueNumber` (create or update), `_status:
   'published'`. Re-running updates rather than duplicating.

Uploads use `payload.create({ collection: 'media', file })`. `BLOB_READ_WRITE_TOKEN`
is present in the local env, so media persists to **Vercel Blob** (served in prod).

### Upload-cap change (required)

`MAX_PDF_BYTES` and the global busboy `fileSize` cap are **25 MB**; 4 of the 20 PDFs
exceed it (≈25.3–26.8 MB). Raise both to **40 MB**. This is an admin-only upload path
(magazine issues require editor/admin), so the DoS surface is limited; the change is a
deliberate, documented adjustment to the Phase 8.2 caps. Update
`tests/int/upload-guard.int.spec.ts` accordingly.

### Cleanup

The demo issue **#999** ("عدد تجريبي") is removed once the real issues are imported.

## Testing

Mirror existing patterns (`tests/int/*.tsx` component tests via vitest + jsdom;
`upload-guard.int.spec.ts`; `tests/e2e/*`):

- **Unit:** `magazineInsertAfterIndex` — fashion present; fashion absent + beauty
  present; both absent; empty.
- **Component:** `MagazineSection` renders «مجلة لالة فاطمة», a `/magazine` link, and
  N covers on a dark band; `IssueCard` shelf vs card variants.
- **Guard:** the raised cap accepts a 28 MB PDF and still rejects an over-40 MB one.
- **e2e (best-effort):** the homepage renders the magazine section with cover links to
  `/magazine`; archive still lists issues.

## Non-goals

- No change to the issue reader (`PdfFacade`), the URL scheme, or the query layer
  beyond the one new read.
- No redesign of the archive grid beyond the light polish.
- No new **runtime** dependencies; PDF rasterization is a **dev/seed-only** dependency
  used solely by the import script.
