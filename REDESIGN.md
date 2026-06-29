# Public-site redesign — foochia/layalina inspired (DONE)

Goal: make the public magazine feel like **foochia.com** (dense, wide, varied block
sizes, highlighted video band) with **layalina.com** editorial polish. Inspiration,
not a clone. Design context captured in `.impeccable.md`.

## Reference findings

**foochia.com**
- **Wide** content area, **tight side gutters** (uses most of the viewport).
- Sections separated by **alternating background bands** (white / light gray `zinc-50`).
- Section headings: bold, right-aligned (RTL), **short magenta underline**; a "المزيد/عرض الكل" pill on the opposite side.
- **Mixed block sizes**, not uniform cards:
  - 4–5-up equal card rows (image-top + headline below).
  - **Asymmetric "lead + stacked list"**: one big feature image card on one side, a column of compact (image+headline) cards on the other.
- **حصري** (exclusive) badge = magenta pill, top corner of the thumbnail.
- Full-bleed **hero** with overlapping small thumbnail cards along the bottom.
- **Video section is the highlight**: tinted/dark band, lead video + stacked list, **magenta circular play-button overlays**, purple-tinted thumbnails.

**layalina.com**
- Editorial, light/airy: a centered tall **lead** flanked by a 2×2 **card grid** on each side.
- Magenta **category kickers**; small "gallery" badge on image corner; white caption block under each image.
- Magazine-issue cover thumbnail in the header.

## Synthesis (target for Lalla Fatema)
Light/white base, magenta (`brand-600`/tints) accents, strong Arabic type hierarchy, RTL, wide container, alternating bands, mixed block sizes, highlighted dark-magenta video band.

## Done so far (committed)
- `.impeccable.md` — design context.
- `.lf-container` utility in `src/app/(frontend)/styles.css` (`max-width:1480px`, tight gutters) — **not yet applied** to layouts.
- `SectionHeading` restyled: magenta underline + "عرض الكل" pill + `light` prop (for dark bands).

## DONE
1. ✅ **`.lf-container`** applied in place of `max-w-7xl px-4` across `Header`, `Footer`, homepage, `[category]`, `author`. Article keeps its narrow `max-w-3xl` reading column. Homepage blocks now own their own container so band backgrounds are full-bleed.
2. ✅ **PostCard**: حصري badge when `category.slug === 'exclusive'`; tighter radii/typography; new `lead` variant (large image + caption block).
3. ✅ **HeroFeature**: big lead overlay (7 cols) + **2×2 secondary grid** (5 cols) on a 12-col grid.
4. ✅ **LeadListBlock** (new): asymmetric lead + stacked compact list; optional `band`.
5. ✅ **SectionBlock**: optional full-bleed `band` background; 4-up rows.
6. ✅ **VideoSection + VideoCard**: dark magenta/purple band (`from-brand-950`), lead video + list, magenta circular play overlays, `light` heading, deferred YouTube iframe (loads on click — zero third-party JS until opt-in). `getLatestVideos` query added; 5 sample videos seeded (`src/seed/index.ts`, category فيديو, placeholder thumbnails).
7. ✅ **Homepage** restructure: hero → featured `LeadListBlock` (band) → standard `SectionBlock`s alternating white/`zinc-50` → **VideoSection**. Still reads the Homepage global (curation) with fallbacks; `video` category excluded from fallback sections.
8. ✅ **Verify**: `tsc` clean, `eslint` clean, `pnpm build` succeeds (static homepage). HTTP check at runtime: RTL, video band present, **0 `/_next/image`** (custom loader), iframes not preloaded, category page 200. (Playwright screenshots skipped — MCP browser profile was locked by another instance.)

Keep performance discipline (priority LCP hero, zero-CLS aspect ratios, minimal client JS) and the custom image loader (never Vercel's optimizer).
