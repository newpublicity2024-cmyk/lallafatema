# Project Brief — Lalla Fatema Magazine Rebuild

## 1. Mission

Rebuild **lallafatema.ma** — an **Arabic, right-to-left (RTL)** lifestyle & celebrity magazine for Moroccan women — replacing its current **WordPress/Elementor** stack with a modern **Next.js (App Router) + Tailwind** application.

- **Keep the full feature set** of the existing site.
- **Re-skin the design and layout** in the polished, glossy style of **layalina.com** and **foochia.com**.
- The result must feel like a **premium lifestyle magazine**: celebrities, women's topics, fashion, beauty, lifestyle, cooking.

Two halves:

1. **Public magazine site** — fast, SEO-strong, image-heavy, RTL Arabic.
2. **Editorial dashboard (Payload CMS)** — where journalists publish articles and an admin controls everything that appears on the site (sliders, panels, section ordering, ads, magazine issues).

## 2. Working mode

Plan heavily, execute in small verifiable steps. Ship a rough-but-working v1 of each phase against the real stack, then iterate from feedback. Check in at the end of each phase before moving to the next. See `PLAN.md` for the phased execution plan.

## 3. Locked stack decisions

- **Framework:** Next.js (App Router) + Tailwind CSS.
- **CMS / dashboard:** Payload CMS 3, running inside the Next.js app (single repo, single Vercel deploy). Payload's Postgres adapter points at Neon, so Payload owns the database schema and migrations. The frontend reads through Payload's Local API where possible.
- **Database:** Neon (Postgres) with branching — `main` for prod, `preview`/`dev` for Vercel preview deploys.
- **Media storage:** Cloudflare R2. Media files live in R2; the DB stores only references.
- **Image resizing/delivery:** Cloudflare Image Transformations at the edge, via a custom `next/image` loader.
- **Hosting/CI/CD:** GitHub repo → Vercel deploy.
- **Language:** Arabic only, RTL.
- **Search:** Meilisearch (dedicated index, good Arabic support).
- **Edge protection:** Cloudflare in front of Vercel for WAF / bot / DDoS and an extra cache layer.

## 4. Confirmed scope decisions

- **Search engine:** Meilisearch.
- **Newsletter:** Brevo (behind a thin provider interface).
- **Web push:** OneSignal (continuity with original).
- **Comments:** skipped (removes spam/moderation surface, matches original).
- **Layalina-style extras** (horoscopes أبراج, calculators حاسبات, dream interpretation): deferred — out of v1.

## 5. Non-negotiable constraints

1. **Image optimization MUST bypass Vercel.** Use a custom `next/image` loader → Cloudflare Image Transformations. Vercel's `/_next/image` optimizer is never used (it 402s on media-heavy sites).
2. **Media never lives in the DB or the repo.** R2 only; DB holds references. Payload's media collection uses an R2/S3 storage adapter.
3. **RTL Arabic, end to end.** `dir="rtl"`, Tailwind logical properties, a subsetted Arabic webfont with `font-display: swap`, Arabic-correct dates/relative times, Arabic-usable admin.
4. **Preserve SEO equity.** Stable slug strategy (`arabic-slug-<id>`) + a complete 301 redirect map from old WordPress URLs.
5. **Decouple traffic from compute.** ISR / on-demand revalidation; pages revalidated on publish via a secret-protected endpoint triggered by a Payload `afterChange` hook.
6. **Ads must not wreck Core Web Vitals.** Ad slots lazy-loaded, height-reserved (no CLS), off the critical render path.

## 6. Content & feature scope

**Content sections (categories):** Celebrities (مشاهير), Latest News (آخر الأخبار), Exclusive News (اخبار حصرية), Health (صحة), Fashion (موضة), Beauty (جمال), Lifestyle (لايف ستايل), Kitchen/Recipes (مطبخ / شهيوات لالة فاطمة), Bride/Wedding (عروس), Video (فيديو).

**Content types:** standard articles, recipes (Recipe schema), YouTube-embedded videos (facade pattern + VideoObject schema), numbered digital magazine issues (PDF/flipbook).

**Public features:** editorially curated homepage (hero slider, featured panels, per-category blocks), category pages, article pages, author pages, magazine archive (in-page PDF viewer + download), video section, site-wide search, newsletter signup, web push opt-in, social share + profiles, static pages (About من نحن، Editorial board هيئة التحرير، Advertise للإعلان، Privacy/Terms/Cookies), NewPub network cross-links in footer (MFM Radio, VH.ma, Challenge.ma, Tomobile360).

**Dashboard features:** roles & access control (admin/editor/journalist, least privilege), rich-text authoring (Lexical) with required alt text + galleries + captions + pull-quotes + embeds, drafts + versions + scheduled publishing + live preview, per-article SEO overrides, a Homepage builder (pin posts into slider/panels) and menu/mega-menu management, ads management (programmatic + direct-sold house ads in zones), magazine issues, R2-backed media library.

## 7. Reference sites

- **Functional source of truth:** `https://lallafatema.ma/` (the site being replaced).
- **Primary design reference:** `https://www.layalina.com/` (dense sectioned homepage, mega-menu, clean card pattern, editorial picks, magenta ~`#bc0168` accent).
- **Secondary design reference:** `https://www.foochia.com/` (younger, denser, more image-forward).
