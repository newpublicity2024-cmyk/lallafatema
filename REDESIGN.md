# Public-site redesign — foochia/layalina inspired (IN PROGRESS)

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

## TODO (resume here)
1. **Apply `.lf-container`** in place of `max-w-7xl px-4` across: `Header`, `Footer`, homepage, `[category]`, `[category]/[slug]` (article keeps a narrower reading column), `author`.
2. **PostCard**: polish; add **حصري badge** when `category.slug === 'exclusive'`; tighten image radius/typography; add a `lead` variant (large w/ caption).
3. **HeroFeature** rework: big lead (overlay) + **2×2 secondary grid** beside it (denser, wider) — closer to layalina's flanked hero / foochia's hero.
4. **LeadListBlock** (new): asymmetric lead + stacked compact list, for a featured section (e.g. مشاهير).
5. **SectionBlock**: support an optional band background; render 4-up rows.
6. **Videos section** (new `VideoSection` + `VideoCard`): highlighted **dark magenta/purple band** (`bg-brand-950`/gradient), lead video + list, **play-button overlays**, `light` headings. Add `getLatestVideos` query. **Seed a few videos** (extend `src/seed/index.ts`: youtube URLs, category `video`, publishedAt; thumbnails optional → placeholder).
7. **Homepage** restructure: hero → alternating bands (white / `zinc-50`) → one featured `LeadListBlock` → standard `SectionBlock`s → **highlighted VideoSection**. Keep reading from the Homepage global (curation) with fallbacks; alternate band bg by index.
8. **Verify**: Playwright at 1440px + mobile (RTL, video band, no `/_next/image`); `tsc` + `eslint` + `pnpm build`; commit.

Keep performance discipline (priority LCP hero, zero-CLS aspect ratios, minimal client JS) and the custom image loader (never Vercel's optimizer).
