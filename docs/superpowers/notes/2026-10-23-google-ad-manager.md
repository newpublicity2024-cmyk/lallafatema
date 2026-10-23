# Google Ad Manager — placement map

Network **32994918** (Les éditions de la gazette), 30 units from the tag sheet
"Tags Google Ad Manager — Lalla Fatema" (extraction 06/10/2026). Registry:
`src/lib/gam.ts`; runtime: `src/lib/gpt.ts`; slot: `src/components/GamSlot.tsx`.

Off switch: Site Settings › الإعلانات › `adsEnabled` (the same master switch as the
dashboard ads). Never shown in the draft preview.

Viewports: phone < 768px ≤ tablet < 1024px ≤ desktop.

## Every page (layout)

| Position                 | Desktop                         | Tablet          | Phone                |
|--------------------------|---------------------------------|-----------------|----------------------|
| Site skin                | Habillage_HP (home) / _RG       | —               | —                    |
| Under the header         | Billboard_HP (home) / _RG       | same, 728x90    | M_320x100_MITOP_AS   |
| Above the footer         | BTF_AS                          | BTF_AS          | M_320x50_BTF_AS      |

## Homepage (between bands)

| After                     | Desktop / tablet   | Phone              |
|---------------------------|--------------------|--------------------|
| Hero                      | Header             | M_320x50_MITOP_AS  |
| Featured section          | —                  | Halfpage_1         |
| Video band                | Billboard_HP_PB    | Halfpage_2         |
| 2nd standard section      | Header_PB          | Halfpage_3         |
| 4th standard section      | Billboard_HP_PB_2  | Halfpage_4         |
| 6th standard section *    | Header_PB_2        | Halfpage_1_PB      |

\* only when it is not the last section (the footer banner follows the last one). The
homepage has six standard sections today, so this break is dormant until a seventh is
added.

## Article

| Position                          | Desktop                    | Tablet / phone          |
|-----------------------------------|----------------------------|-------------------------|
| After the 2nd paragraph           | Inread (`/32994918/35`)    | Inread                  |
| Rail, top                         | Halfpage_1                 | —                       |
| Rail, sticky                      | Halfpage_2                 | —                       |
| After the 6th paragraph           | —                          | Halfpage_1              |
| End of the body                   | —                          | Halfpage_2              |
| Between article and related posts | Billboard_RG_PB            | —                       |

When the 2nd paragraph is the body's last block (or there is no 2nd), the in-read
follows the body instead.

## Category page

After the 8th post: Billboard_RG_PB (desktop/tablet), Halfpage_1 (phone).

## Registered, not placed

BTF_AS_PB, M_320x50_BTF_AS_PB, M_320x50_MITOP_AS_PB, M_320x50_MITOP_AS_PB_2,
Halfpage_1_PB_2, Halfpage_2_PB, Halfpage_2_PB_2, Halfpage_3_PB, Halfpage_3_PB_2,
Halfpage_4_PB. These are lower repeats of formats already on the page; no current
page is long enough to need them. Placing one is a single `<GamSlot unit="…" />`.

## Open with the network

- **ads.txt** — not published yet. Programmatic (AdX) demand needs the
  `google.com, pub-…, DIRECT, f08c47fec0942fa0` line for this network's publisher
  id, which is not on the tag sheet. Ask the network for the full ads.txt.
- **Skin creatives** must be set to serve *outside* SafeFrame in Ad Manager, or
  they cannot reach the page. While one renders, `<html>` gets `lf-skinned` and the
  page narrows to the 1296px content column so the skin shows down both sides.
- **The in-read code `35`** — the sheet asks to check it. It matches how the network
  names in-read units elsewhere (Challenge.ma serves `/32994918/60` and `/61`).
- **Consent** — readers who have not accepted advertising cookies get
  non-personalised ads (`npa=1`), which still serve.
