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

## TODO (resume here)
### A. Ads — new collection `ads`
- [ ] `src/collections/Ads.ts`. Fields: `title` (internal name), `placement`
  (select: header/leaderboard, sidebar, in-article, between-sections, footer, popup),
  `format` (select: image | embed), `image` (upload→media)+`targetUrl`+`newTab`+`alt`,
  `htmlEmbed` (code field, for AdSense/ad networks), `priority` (number, rotation),
  `startDate`/`endDate` (schedule window), `active` (checkbox); optional targeting:
  `categories` (relationship hasMany).
- [ ] Access: read = public but ONLY active & within date window (custom `Access`
  returning a `Where`); create/update/delete = `isAdminOrEditor`. afterChange/afterDelete → revalidate.
- [ ] `admin`: group `الإعلانات`, useAsTitle `title`, defaultColumns [title, placement, active, startDate, endDate].
- [ ] Register in `payload.config.ts` collections. **Migration:** `payload migrate:create add_ads` → `migrate`.
- [ ] `getActiveAds(placement)` in `src/lib/queries.ts` (active + now within window, sort by priority).
- [ ] `<AdSlot placement>` component: renders image-link or embed; **fixed reserved
  height → zero CLS**; renders nothing if no ad. Wire slots: header, in-article mid-content,
  homepage between-bands, sidebar/footer. (Rendering can be a follow-up step.)

### B. Site Settings global — `site-settings`
- [ ] Move `src/lib/site.ts` into a global: name, tagline, `logo` (upload), social
  links, footer page links, NewPub links, default OG image, optional analytics IDs, ad toggles.
- [ ] `getSiteSettings()` query; Header/Footer/layout read it with current constants as fallback.
- [ ] group `الإعدادات`; access read `anyone` / update `isAdmin`; revalidate on change.

### C. Admin landing dashboard
- [ ] `admin.components.beforeDashboard` → custom RTL component: welcome line,
  quick-create (مقال جديد، فيديو، إعلان), shortcuts (إدارة الصفحة الرئيسية، الوسائط،
  المستخدمون), recent drafts / "مسوّداتي" for journalists. Per-collection counts optional.
- [ ] Optional: `admin.components.graphics` (logo) + custom login screen.

### D. Admin IA / grouping
- [ ] Normalize `admin.group`: `المحتوى` (Posts, Videos, MagazineIssues, Pages, Media),
  `التصنيف` (Categories, Tags), `الإعلانات` (Ads), `الإعدادات` (Homepage, MainMenu,
  SiteSettings), `الإدارة` (Users).

### E. Curation completeness (Homepage global)
- [ ] Add: featured-section selector (which section renders as the `LeadListBlock`),
  video-band toggle + pinned videos (relationship→videos), optional per-placement ad
  toggles. `src/app/(frontend)/page.tsx` already reads Homepage w/ fallbacks → extend to consume these.

### F. Access + branding review
- [ ] Confirm ads & settings = admin/editor only; journalists cannot touch them.
- [ ] Admin logo/wordmark + favicon; review Arabic labels.

### G. Verify
- [ ] `tsc` + `eslint` + `pnpm build`; run migrations; seed a sample ad; Playwright:
  ad slots render with zero CLS and no `/_next/image`; journalist role can't see Ads/Settings.

## Notes
- **Migrations required** (`push:false`; dev+prod share one Neon DB):
  `npx pnpm@10.18.0 exec payload migrate:create <name>` then `… migrate`. Never auto-push.
- Keep performance discipline (zero-CLS ad slots, custom Cloudflare image loader, minimal client JS) and RTL throughout.
- Dev: `npx pnpm@10.18.0 dev`. Admin: `dev@lallafatema.ma` / `DevAdmin!2026`.
