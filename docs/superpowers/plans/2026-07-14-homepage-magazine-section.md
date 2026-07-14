# Plan — Homepage Magazine Section + Magazine Import

Design: `docs/superpowers/specs/2026-07-14-homepage-magazine-section-design.md`
Branch: `feat/homepage-magazine-section`

## Background

`magazine-issues`, `/magazine`, `IssueCard`, `PdfFacade`, and the `Carousel`
(mobile-swipe/desktop-grid, single responsive DOM) all already exist. This adds a
homepage magazine band between موضة and جمال, lightly polishes the archive, and loads
the 20 real issues from the git-ignored `magazines/` folder.

## Global Constraints (bind every task; the review lens)

- **RTL-first.** Logical properties only (`ps/pe/ms/me`, `start/end`,
  `text-start`) — never hardcode left/right. This is an Arabic RTL site.
- **Design tokens (verbatim):** dark band = `lf-band-dark` (#23112c). Container =
  `lf-container`. White card = `lf-card`. Brand accent = `brand-600` (#bc0168).
  Section heading is the existing `SectionHeading` component (its `light` prop yields
  white title + `bg-white/10` pill); do not re-implement a heading.
- **Reuse, don't fork:** the homepage section uses the existing `Carousel`
  (`dotColor="light"`) and `IssueCard`, exactly as `SectionBlock`/`LeadListBlock` do.
  No new carousel/heading code.
- **Homepage heading text:** exactly «مجلة لالة فاطمة». Section links to `/magazine`
  via `magazineArchiveUrl()`. Issue links via `magazineIssueUrl(issue)`.
- **Issue-number mapping (verbatim):** `issueNumber = 168 - Number(n)` where `n` is the
  `index.json` entry number (n01→167 … n20→148). `title = «العدد ${issueNumber}»`.
- **Upload cap:** raise `MAX_PDF_BYTES` and payload.config global `upload.limits.fileSize`
  to **40 MB = 41_943_040**. Image cap (`MAX_IMAGE_BYTES`, 10 MB) is unchanged.
- **Server components** by default; only `Carousel` (already `'use client'`) is a
  client component. `MagazineSection` is a server component that composes `Carousel`.
- **Zero published issues → the section renders nothing** (`null`), no empty band.
- **No new runtime deps.** PDF rasterization for the importer is a dev/seed-only
  dependency (used only by `src/seed/import-magazines.ts`).
- **Tests mirror existing patterns:** component tests as `tests/int/*.int.spec.tsx`
  (vitest + jsdom + @testing-library/react — see `carousel.int.spec.tsx`,
  `postcard-overlay.int.spec.tsx`); pure-logic tests as `tests/int/*.int.spec.ts`
  (see `routes.int.spec.ts`); guard test in `upload-guard.int.spec.ts`.
- **Verify before "done":** each task runs `pnpm lint`, `pnpm test:int`, and (for
  code that type-checks) a build/`tsc` where practical; report the actual command +
  output. Use `npx pnpm@10.18.0` if the PATH pnpm is too old.

## Tasks

### Task 1 — Query + pure placement helper

**Files:** `src/lib/queries.ts`, new `src/lib/homepage.ts`, new
`tests/int/homepage-magazine.int.spec.ts`.

1. Add `getLatestMagazineIssues(limit = 6): Promise<MagazineIssue[]>` to `queries.ts`
   — same shape as `getMagazineIssues` (published only, `sort: '-issueNumber'`,
   `depth: 1`) but with the passed `limit`.
2. New `src/lib/homepage.ts` exporting the pure function
   `magazineInsertAfterIndex(slugs: string[]): number`:
   - index of `'fashion'` if present;
   - else `indexOf('beauty') - 1` if `'beauty'` present;
   - else `slugs.length - 1`.
3. Unit-test the helper (mirror `routes.int.spec.ts`): fashion present →its index;
   fashion absent + beauty present → beautyIdx-1; both absent → len-1; `[]` → -1.

**Done:** helper + query exported; `pnpm test:int` green for the new spec.

### Task 2 — `IssueCard` shelf variant + `MagazineSection`

**Files:** `src/components/IssueCard.tsx`, new `src/components/MagazineSection.tsx`,
new `tests/int/magazine-section.int.spec.tsx`.

1. `IssueCard`: add `variant?: 'card' | 'shelf'` (default `'card'`). `'card'` is the
   current markup, unchanged. `'shelf'`: no `lf-card` box — the portrait cover
   (`aspect-[3/4]`, `rounded-lg overflow-hidden`, `ring-1 ring-white/10`, soft shadow,
   `group-hover:scale-105`) in a `Link`, then title in `text-white` + date in
   `text-white/60` beneath, centered. Same `href`/`title` logic as today; keep
   `PostImage` for the cover with an appropriate `sizes`.
2. `MagazineSection({ issues }: { issues: MagazineIssue[] })`: returns `null` when
   `issues.length === 0`; else `<section className="lf-band-dark">` → `lf-container
   py-12` → `SectionHeading light title="مجلة لالة فاطمة" href={magazineArchiveUrl()}`
   → `<Carousel dotColor="light" trackClassName="md:grid-cols-6">` mapping issues to
   `<IssueCard variant="shelf" />`. Mirror `SectionBlock.tsx` structure.
3. Component tests (mirror `carousel.int.spec.tsx`/`postcard-overlay.int.spec.tsx`):
   `MagazineSection` renders the heading text, a link to `/magazine`, one
   `/magazine/<n>` link per issue, and the `lf-band-dark` section; empty issues →
   renders nothing. `IssueCard` shelf renders white title (no `lf-card`); card variant
   still renders `lf-card`.

**Done:** both render per spec; `pnpm test:int` green.

### Task 3 — Homepage integration + archive polish

**Files:** `src/app/(frontend)/page.tsx`, `src/app/(frontend)/magazine/page.tsx`,
`tests/e2e/magazine.e2e.spec.ts` (extend).

1. `page.tsx`: fetch `getLatestMagazineIssues(6)`. Compute `insertAfter =
   magazineInsertAfterIndex(standard.map(s => s.category.slug ?? ''))`. In the
   `standard.map(...)`, wrap each item in a `<Fragment>` and render
   `<MagazineSection issues={magazineIssues} />` **after** the section at index
   `insertAfter`; when `insertAfter < 0`, render it **before** the first section
   (index 0). Preserve the existing `band={i % 2 === 1}` alternation for the category
   sections (the dark magazine band sits between them, independent of that toggle).
2. `magazine/page.tsx`: add a one-line intro `<p>` under `SectionHeading` (e.g.
   «تصفّحي كل أعداد مجلة لالة فاطمة الرقمية، واقرئي أو حمّلي كل عدد بصيغة PDF.») and add
   `lg:grid-cols-5` to the grid. No other change.
3. e2e: extend `magazine.e2e.spec.ts` (or add a homepage case) — on `/`, the magazine
   section heading «مجلة لالة فاطمة» is visible and a `a[href^="/magazine/"]` cover
   link exists. Best-effort (needs the dev server + DB, which the Playwright config
   auto-starts); if the environment can't run it, report that and rely on the
   component tests.

**Done:** homepage shows the band after موضة; archive polished; `pnpm lint` +
`pnpm test:int` green; e2e run attempted with output reported.

### Task 4 — Raise the PDF upload cap to 40 MB

**Files:** `src/lib/upload-guard.ts`, `src/payload.config.ts`,
`tests/int/upload-guard.int.spec.ts`.

1. `upload-guard.ts`: `MAX_PDF_BYTES = 40 * 1024 * 1024`. Update the doc comment.
2. `payload.config.ts`: `upload.limits.fileSize = 41_943_040` (keep `abortOnLimit`),
   update the inline comment (was 25 MB).
3. Update `upload-guard.int.spec.ts`: a 28 MB PDF is accepted; an over-40 MB PDF is
   rejected with the size message; image cap behavior unchanged.

**Done:** `pnpm test:int` green for the guard spec.

### Task 5 — Magazine importer script

**Files:** new `src/seed/import-magazines.ts`; `package.json` (a `seed:magazines`
script + the dev/seed rasterization dependency).

1. Read `magazines/index.json`. For each entry compute `issueNumber = 168 - Number(n)`
   and resolve the PDF path `magazines/<file>`.
2. Generate the cover from **PDF page 1** as a PNG/JPEG buffer using a dev-only
   Node library that needs **no system binaries** and works on win32 (e.g.
   `pdf-to-img`, or `pdfjs-dist` + `@napi-rs/canvas`). Pick whichever installs and
   runs on this machine; if none can be made to work, stop and report BLOCKED (do not
   invent a fake cover).
3. Upload cover → `media` (`alt: «غلاف العدد ${issueNumber}»`) and PDF → `media`
   (`alt: «مجلة لالة فاطمة — العدد ${issueNumber}»`), then upsert the `magazine-issues`
   doc by `issueNumber` (create, or update if it exists), `_status: 'published'`,
   `title: «العدد ${issueNumber}»`, `publishDate` optional.
4. Idempotent + safe: support `--dry-run` (log the planned actions, no writes) and
   re-running (update existing issues / skip re-upload when a cover+pdf already
   attached — at minimum do not create duplicates). Log a per-issue summary and a
   final count. Do **not** delete #999 here (the controller handles cleanup).
5. Add `"seed:magazines": "cross-env NODE_OPTIONS=--no-deprecation tsx src/seed/import-magazines.ts"`
   to `package.json`, mirroring the existing `seed` script.

**Do not run the import in this task** — the controller runs it after review (it
writes to the shared prod DB + Blob). Verify the script **compiles/type-checks** and a
`--dry-run` against `index.json` prints the correct 20-row plan (issueNumbers 167→148)
without writing. Report the rasterization library chosen and the dry-run output.

**Done:** script type-checks; `--dry-run` prints 20 planned issues 167→148; chosen
library installs cleanly.

## Post-tasks (controller-run, not a subagent task)

1. Run `pnpm seed:magazines --dry-run`, confirm the plan, then run it for real.
2. Verify covers + PDFs appear on `/magazine` and the homepage band; spot-check one
   issue reader.
3. Delete the demo issue **#999**.
4. Final whole-branch review, then finish the branch (PR/merge).
