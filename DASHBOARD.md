# Admin dashboard — editorial control center (PLAN / groundwork)

**Goal:** one Payload admin "control panel" where the whole site is managed —
journalists author articles (content + images + metadata), editors **manually
curate what gets displayed** on top of the automatic feeds, **ads** are managed,
and everything is **role-restricted**. Backed by the Neon DB. Display stays
automatic by default but every surface remains manually overridable.

This file is the **resumable plan**. Groundwork/audit is captured here; build it
out in the next session, top to bottom.

## What already exists (audit — DO NOT rebuild)
**Collections** (all Arabic/RTL; drafts+autosave where noted):
- **Posts** — title, excerpt, content (Lexical), featuredImage, category, authors,
  tags, isRecipe+recipe, publishedAt, seo, slug. Drafts. Journalists own their drafts.
- **Categories** (hierarchical via `parent`) + **Tags** — group `التصنيف`.
- **Videos** — title, videoUrl, thumbnail, description, duration, category,
  publishedAt, seo, slug. Drafts. group `المحتوى`.
- **MagazineIssues**, **Pages**, **Media** — group `المحتوى`. Media has alt/caption/
  credit; R2 S3 adapter gated on `R2_*` env (else local disk).
- **Users** — roles admin/editor/journalist; **first user auto-admin**; author
  profile (bio/avatar/title/social). group `الإدارة`.

**Globals:**
- **Homepage** (`الإعدادات`) — `heroPosts` (pinned hero) + `sections[]` (category,
  titleOverride, limit, pinnedPosts). This is the existing curation surface.
- **MainMenu** (`الإعدادات`) — nav items + mega submenu.

**Access** (`src/access/index.ts`): `admin` (full) · `editor` (manage/publish all
editorial + taxonomy + media) · `journalist` (own drafts only, cannot publish).
Helpers: `canReadPosts`, `canModifyOwnPosts`, `canReadPublished`, field-level role lock.

**Infra:** Arabic-first i18n + RTL admin; live preview (posts, pages) via `/preview`;
on-publish revalidation hooks + secret `/revalidate`; **migration-driven (`push:false`)**.

**Not yet dashboard-managed:** site constants are HARDCODED in `src/lib/site.ts`
(name, tagline, social links, footer pages, NewPub links). No **Ads** anywhere.

## Target additions (the "control panel")
1. **Ads** — the main gap; fully managed in the dashboard.
2. **Site Settings global** — move `src/lib/site.ts` into the DB (branding/social/footer editable).
3. **Admin landing dashboard** — overview + quick actions for editors/journalists.
4. **Admin IA** — consistent grouping so everything is laid flat & discoverable.
5. **Curation completeness** — expose the redesign pieces (featured LeadListBlock,
   video band, ad placements) in the Homepage global.
6. **Access review + branding.**

## STATUS — §A–§G all built & verified (2026-06-30)
All sections below are done. tsc + eslint + `pnpm build` pass; migrations applied to
Neon (`add_ads`, `add_site_settings`, `add_homepage_curation`); a sample script ad
(id 1, between-sections) renders at a fixed 90px box (zero CLS, no `/_next/image`);
admin landing panel + Ads create form (conditional fields) + Site Settings (5 tabs)
all render. **Follow-ups (2026-07-01, DONE):** wired **header** leaderboard slot
(layout, after the sticky Header) + **in-article** slot (ArticleView, after body,
category-targeted); added **favicon** (`src/app/icon.svg` — ف monogram on brand
magenta, fixes the console 404) + **admin graphics** (`src/components/admin/Logo.tsx`
+ `Icon.tsx`, registered via `admin.components.graphics`, importMap regenerated).
tsc+eslint+build all pass. **Still deferred:** the **sidebar** `<AdSlot>` has no home
in the current design — the article is a deliberate centered ≤1000px reading column
and the homepage/category grids have no rail. Adding it needs a design decision
(introduce a sidebar rail vs. leave `sidebar` as an unused placement).

## TODO (resume here)
### A. Ads — new collection `ads` (BOTH static creatives AND script/network ads) — DONE
Two ad kinds, both managed in the dashboard:
- **Static** — an image I upload + a target URL (self-served house ads / direct deals).
- **Script** — an ad-network unit (AdSense etc.) that needs raw markup/JS. These need
  **a head part and a body part** (loader vs. ad-unit) — see Site Settings (§B) for the
  site-wide head/body loader, and the per-ad `bodyScript` here for the unit at the slot.

- [x] `src/collections/Ads.ts`. Fields:
  - `title` (internal name), `placement` (select: header/leaderboard, sidebar,
    in-article, between-sections, footer, popup), `priority` (number, rotation),
    `startDate`/`endDate` (schedule window), `active` (checkbox);
    optional targeting `categories` (relationship hasMany).
  - `format` (select: **`image`** | **`script`**).
  - When `image`: `image` (upload→media) + `targetUrl` + `newTab` + `alt`.
  - When `script`: `bodyScript` (code field — the ad-unit markup/JS placed AT the slot,
    e.g. `<ins class="adsbygoogle">…`) and optional per-ad `headScript` (code — extra
    head JS if a unit needs it; the main network loader lives once in Site Settings §B).
  - Conditionally show `image*` vs `*Script` fields via `admin.condition` on `format`.
- [x] Access: read = public but ONLY active & within date window (custom `Access`
  returning a `Where`); create/update/delete = `isAdminOrEditor`. afterChange/afterDelete → revalidate.
- [x] `admin`: group `الإعلانات`, useAsTitle `title`, defaultColumns [title, placement, format, active, startDate, endDate].
- [x] Register in `payload.config.ts` collections. **Migration:** generate with Payload
  (`payload migrate:create add_ads`) so config↔DB stay in sync, then apply (see §Notes — Neon MCP).
- [x] `getActiveAds(placement)` in `src/lib/queries.ts` (active + now within window, sort by priority).
- [x] `<AdSlot placement>` component: renders an image-link OR injects the `bodyScript`
  (use `next/script` / sanitized `dangerouslySetInnerHTML`; raw HTML is trusted because
  only admin/editor can author it). **Fixed reserved height per placement → zero CLS**;
  renders nothing if no active ad. Wire slots: header, in-article mid-content,
  homepage between-bands, sidebar/footer. (Rendering can be a follow-up step.)
  → component DONE (`src/components/AdSlot.tsx` + `AdScript.tsx` + `lib/inject-html.ts`).
  Wired: **between-sections** (homepage, behind Homepage toggle) + **footer** +
  **header** (layout leaderboard) + **in-article** (ArticleView, category-targeted).
  STILL TODO: **sidebar** slot (no rail in the current design — needs a layout decision).

### B. Site Settings global — `site-settings`
- [x] Move `src/lib/site.ts` into a global: name, tagline, `logo` (upload), social
  links, footer page links, NewPub links, default OG image, optional analytics IDs, ad toggles.
- [x] **Site-wide script injection** (the ad "header/body" the user asked for): a
  `headScripts` (code, injected once into `<head>` — AdSense loader `adsbygoogle.js`,
  site verification meta, GTM head) and `bodyScripts` (code, injected at start of
  `<body>` — GTM noscript, etc.). Inject in `src/app/(frontend)/layout.tsx` via
  `next/script` (`strategy="afterInteractive"` for loaders) or sanitized raw HTML.
  Admin-only edit → trusted; document the XSS surface in a comment.
- [x] `getSiteSettings()` query; Header/Footer/layout read it with current constants as fallback.
- [x] group `الإعدادات`; access read `anyone` / update `isAdmin`; revalidate on change.

### C. Admin landing dashboard
- [x] `admin.components.beforeDashboard` → custom RTL component: welcome line,
  quick-create (مقال جديد، فيديو، إعلان), shortcuts (إدارة الصفحة الرئيسية، الوسائط،
  المستخدمون), recent drafts / "مسوّداتي" for journalists. Per-collection counts optional.
- [x] Optional: `admin.components.graphics` (logo) + custom login screen.

### D. Admin IA / grouping
- [x] Normalize `admin.group`: `المحتوى` (Posts, Videos, MagazineIssues, Pages, Media),
  `التصنيف` (Categories, Tags), `الإعلانات` (Ads), `الإعدادات` (Homepage, MainMenu,
  SiteSettings), `الإدارة` (Users).

### E. Curation completeness (Homepage global)
- [x] Add: featured-section selector (which section renders as the `LeadListBlock`),
  video-band toggle + pinned videos (relationship→videos), optional per-placement ad
  toggles. `src/app/(frontend)/page.tsx` already reads Homepage w/ fallbacks → extend to consume these.

### F. Access + branding review
- [x] Confirm ads & settings = admin/editor only; journalists cannot touch them.
- [x] Admin logo/wordmark + favicon; review Arabic labels. → Arabic labels reviewed
  (all RTL); logo/wordmark + nav icon added (`admin.components.graphics` → Logo/Icon);
  favicon added (`src/app/icon.svg`, 404 fixed).

### G. Verify
- [x] `tsc` + `eslint` + `pnpm build`; run migrations; seed a sample ad; Playwright:
  ad slots render with zero CLS and no `/_next/image`; journalist role can't see Ads/Settings.

## Notes
- **Migrations (`push:false`; dev+prod share one Neon DB).** Payload OWNS the schema —
  author schema changes with Payload's generator so config↔DB never drift:
  `npx pnpm@10.18.0 exec payload migrate:create <name>` (introspects the collection
  config → writes the SQL), then apply with `… migrate`. Do NOT hand-write `CREATE TABLE`
  from scratch — that drifts from what Payload expects.
- **Neon MCP is connected** — use it for: inspecting the live schema (`describe_table_schema`,
  `get_database_tables`) to verify a migration landed, applying/checking the
  Payload-generated migration SQL, and **direct data insertions** (e.g. seeding sample
  ads via `run_sql`). Prefer `prepare_database_migration` → review → `complete_database_migration`
  for schema, and `run_sql` for data. Source of truth for schema stays the Payload config.
- Keep performance discipline (zero-CLS ad slots, custom Cloudflare image loader, minimal client JS) and RTL throughout.
- Dev: `npx pnpm@10.18.0 dev`. Admin: `dev@lallafatema.ma` / `DevAdmin!2026`.
