# Perf & A11y Pass — Phase 8.3 (2026-07-09)

Measure-and-fix-to-a-bar pass over the public site: axe-core + Lighthouse (lab)
baseline, every concrete finding fixed, and a permanent axe regression gate landed
in the Playwright suite. Verdict: the site clears every bar set by the spec — zero
axe violations (WCAG A/AA) on 7 representative routes, Lighthouse Accessibility
≥ 0.95 and Performance ≥ 0.90 on all measured routes, and the manual keyboard /
reduced-motion sweep passes. No schema change, no new runtime dependency, ISR
intact (homepage still `○ Static`, `0 /_next/image`). Branch `phase-8.3-perf-a11y`,
6 tasks, spec at `docs/superpowers/specs/2026-07-09-phase-8-perf-a11y-design.md`.

## axe gate — WCAG A/AA, 7 representative routes

`tests/e2e/a11y.e2e.spec.ts` (`describe('axe gate — WCAG A/AA, 7 routes')`) runs
`@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa` against each
route and asserts zero violations. The spec's 7-route set expands to 8 concrete
page audits (the "magazine" entry covers both the archive and one issue page):

| # | Route | Result |
|---|---|---|
| 1 | `/` (home) | 0 violations |
| 2 | `/search` | 0 violations |
| 3 | `/about` (Pages collection) | 0 violations |
| 4 | `/magazine` (archive) | 0 violations |
| 5 | `/magazine/[issueNumber]` (one issue) | 0 violations |
| 6 | an article `/[category]/[slug]-[id]` | 0 violations |
| 7 | a category `/[category]` | 0 violations |
| 8 | a video watch page `/videos/[slugId]` | 0 violations |

**One real violation was found and fixed** (no `.exclude()` was used or needed —
this was a genuine bug, not a false positive). First run: 3 of the 8 routes
(`/`, article, category) failed `focusable-no-name` (serious; WCAG 2.4.4 Link
Purpose / 4.1.2 Name-Role-Value). Every card (`PostCard`, `IssueCard`,
`VideoCard`) wraps an image-only `<Link>` around `PostImage`; when a post/issue
had no featured photo, the placeholder rendered `aria-hidden`, leaving the
wrapping anchor with no accessible name. Fix (`src/components/PostImage.tsx:32-40`,
commit `f526dee`): the placeholder `<div>` now carries `role="img"
aria-label={alt || 'لالة فاطمة'}` (named from the title callers already pass as
`alt`); the decorative wordmark `<span>` stays `aria-hidden` to avoid a double
announcement. Re-run after the fix: 8/8 axe-gate tests green.

**Documented axe limitation — why the computed-contrast sweep exists.**
axe-core 4.12.1's `color-contrast` rule silently marks most Arabic-script text on
this site **inapplicable** (not pass, not fail, not incomplete — simply excluded
from evaluation), so "zero axe violations" on its own would *not* prove the
site's Arabic text meets AA contrast. Root cause (confirmed by tracing axe's
`_isIconLigature()` heuristic, which exists to exclude icon fonts): it rasterizes
a string on a `<canvas>` and compares per-character vs. whole-string glyph widths
to detect icon-font ligatures; Arabic's normal contextual letter-joining
(initial/medial/final/isolated forms) produces the same width-mismatch signature,
so h3 post titles, `<time>` timestamps, and most body text false-positive as
"icon ligatures" and get dropped from the rule entirely. This was discovered in
Task 1 and independently confirmed (English-text-clone proxy technique — same
class, same DOM position, only the text swapped to Latin — showed axe evaluating
the *same* token pair at 2.62:1 fail / 4.82:1 pass, matching the real fix). It is
a false positive in axe's heuristic, not a defect in this codebase.

## Arabic computed-contrast sweep (augmentation beyond the brief's axe gate)

Because axe cannot see most Arabic text, `tests/e2e/a11y.e2e.spec.ts`
(`describe('Arabic contrast sweep')`) adds a second, independent guard: a
deterministic `contrastRatio()` helper that rasterizes any CSS color (including
the `lab()`/`oklch()` forms Tailwind v4's `getComputedStyle` emits, which a plain
`rgb()` regex parser would fail on) through a 1×1 canvas, walks to the first
opaque ancestor background, composites alpha, and returns the real WCAG ratio —
validated against axe's own numbers to 2 decimals. 8 tests cover representative
Arabic text (headings, kickers, timestamps, excerpts, prose, nav/footer links)
across all 7 routes, evaluated against each element's **actual rendered
background** — critically including the alternating homepage bands, where a
token that clears AA on white can fail on a band:

| Surface | Background | Tightest token found | ~Computed |
|---|---|---|---|
| White `.lf-card` | `#fff` | zinc-500 timestamps | ~4.8:1 (pass) |
| Gray band `.lf-band` | `#f0f0f0` | compact-variant zinc-600 timestamp | 6.77:1 (pass; zinc-500 would be 4.24:1, **fail**) |
| Dark band `.lf-band-dark` | `#23112c` | white/70 lead description | ~9.0:1 (pass) |
| Footer | `bg-zinc-50` | zinc-500 copyright line | ~4.6:1 (pass) |

All 8 sweep tests passed cleanly — the one band-specific bug this sweep was
designed to catch (the compact-variant timestamp, see "Fixes shipped" below) had
already been found and fixed in Task 1; the sweep now locks it against
regression rather than having discovered a new one.

**Documented exclusions (background-dependent, deliberately not asserted):**
text overlaid directly on **photographs** — the hero `PostCard variant="overlay"`
title/date and `VideoCard` thumbnail glyphs. Their contrast depends on the
specific photo, not a design token, so a deterministic assertion would be
flaky/non-deterministic. Mitigation in place instead: the `from-black/80
via-black/25` gradient scrim under the overlay text.

## Lighthouse (lab) score table

Local-only, via `pnpm lighthouse` (`scripts/lighthouse.mjs`, devDependencies
`lighthouse` + `chrome-launcher`, **not** wired into CI — deliberately deferred,
see Explicit deferrals). Runs against a `next start` production build; bars are
Accessibility ≥ 0.95 and Performance ≥ 0.90.

**Initial measurement** — every route already cleared both bars on the very
first run; no application-source performance fix was required anywhere:

| Route | Accessibility | Performance |
|---|---|---|
| `/` (home) | 1.00 | 0.97 |
| `/search` | 0.98 | 0.93 |
| `/about` | 0.98 | 0.95 |
| `/magazine` | 1.00 | 0.95 |
| article | 1.00 | 0.93 |
| video | 1.00 | 0.96 |

**Final / steady-state measurement** (canonical, per the SDD progress ledger) —
after two script-quality fixes (explicit route logging, clearer home-row label)
and one script-reliability addition (a warmup pass, see below):

| Route | Accessibility | Performance |
|---|---|---|
| `/` (home) | 1.00 | 0.93 |
| `/search` | 0.98 | 0.94 |
| `/about` | 0.98 | 0.95 |
| `/magazine` | 1.00 | 0.95 |
| article | 1.00 | 0.97 |
| video | 1.00 | 0.94 |

Both tables clear both bars on every route; the deltas between them (e.g. `/`
0.97→0.93, article 0.93→0.97) are normal Lighthouse lab run-to-run noise
(±0.03–0.04), confirmed by cross-run comparison — not a regression and not a
fix. **The warmup artifact:** one re-run (immediately after the script fixes)
measured `/` — the query-heaviest route, hit first right after `next start` — at
perf **0.73** and failed the gate. Root cause: Neon's serverless compute
auto-suspends when idle, and that run followed ~20 idle minutes; the first
passing run had happened right after `pnpm build`, while the compute was still
warm. `scripts/lighthouse.mjs` now fetches each route once ("warming routes...")
before the Lighthouse loop, measuring steady state instead of a cold-DB outlier —
the production-representative case, since a live deployment keeps the DB warm
behind real traffic / a CDN. This is a lab-measurement artifact of a cold
serverless database on this dev box, not a site defect; no application source
was touched to fix it.

## Fixes shipped

- **Contrast tokens** — `text-zinc-400` (≈2.6:1, fails AA) fixed at 5 original
  sites: 4 → `text-zinc-500` (≈4.8:1 on white), namely `PostCard.tsx`
  lead-variant timestamp (:125) and default/hero-variant timestamp (:161),
  `IssueCard.tsx:30`, and the `Pagination.tsx:31` ellipsis-gap text; 1 →
  `text-zinc-600` (the compact variant, below). Commit `762a27b`, guarded by a
  deterministic computed-contrast test (`d88b432`) that fails at 2.62:1 if the
  token regresses — proven with a real source revert (RED) / restore (GREEN).
  **Compact-variant exception**: `PostCard.tsx:69` needed `text-zinc-600`
  (6.77:1), not `zinc-500` — this variant (used only by `LeadListBlock`) renders
  directly on the gray `.lf-band` (`#f0f0f0`), where `zinc-500` is only 4.24:1
  and fails AA. Found and fixed in the same task via the compact-variant test
  gap the coordinator flagged; commit `1ace28c`.
- **Skip link + centralized `<main>`** — `src/app/(frontend)/layout.tsx:58-63,73`:
  a skip link (`<a href="#main">تخطَّ إلى المحتوى</a>`, logical RTL positioning
  `focus:start-2`) as the first focusable element in `<body>`, and a single
  `<main id="main" tabIndex={-1}>` landmark. All 8 page-level files that
  previously rendered their own `<main>` (`page.tsx`, `ArticleView.tsx`,
  `PageView.tsx`, `[category]/page.tsx`, `videos/[slugId]/page.tsx`,
  `magazine/page.tsx`, `magazine/[issueNumber]/page.tsx`, `author/[id]/page.tsx`)
  were converted to plain `<div>`s with their layout classes preserved.
  `grep -rn "<main" src/app src/components` confirms exactly one match. Commit
  `1146bd7`.
- **Consent-dialog focus handling (non-modal)** — `src/components/ConsentBanner.tsx`:
  focus moves into the dialog (`tabIndex={-1}` container) when it opens
  (`dialogRef.current?.focus()` in an effect); `Esc` collapses the Customize
  panel while the banner itself stays (`onKeyDown` scoped to `customizing`);
  focus returns to the reopening trigger (footer's cookie-settings button) after
  a choice is made, via a `triggerRef` captured in `reopen()` and refocused with
  `requestAnimationFrame` in `resolve()`. Deliberately **not** a focus trap — no
  `aria-modal`, no Tab-cycling — because the banner is a non-obscuring bottom
  overlay, not a true modal (see "Explicit deferrals"). Commit `0e80e74`.
- **PostImage accessible name** — see "axe gate" above. Commit `f526dee`.

## Manual keyboard / reduced-motion sweep

Dev server up (`npx pnpm@10.18.0 dev`, :3000), each item verified as noted —
"driven check" means a temporary, uncommitted Playwright spec was run once
against the live dev server for real measured evidence, then deleted (same
disposable-debug-spec pattern Task 1 used), rather than resting on inspection
alone. Nothing below is a claim of an unrun manual visual test.

| # | Item | Result | Verified by |
|---|---|---|---|
| 1 | Skip link appears on first `Tab` and moves focus to `#main` | PASS | Automated e2e test `tests/e2e/a11y.e2e.spec.ts:121` ("skip link is the first focusable element and moves focus to main") — part of the 23/23 green a11y-gate run |
| 2 | Every interactive control shows a visible `:focus-visible` ring | PASS | Code inspection: global, unscoped rule at `src/app/(frontend)/styles.css:71-74` (`outline: 2px solid var(--color-brand-600); outline-offset: 2px;`) applies to every focusable element site-wide, no per-component opt-out. **Driven check**: a real `Tab`-key press (not `.focus()`, so Chromium's focus-visible heuristic genuinely engages) landed on a header link and measured computed `outline-style: solid`, `outline-width: 2px`, `outline-color: rgb(188, 1, 104)` (= `#bc0168` = `brand-600`) — the rule is confirmed rendering, not just declared |
| 2a | …including over the dark hero-overlay scrim | PASS (computed, not screenshotted) | Code inspection — the rule above is global/unscoped, so it also covers the overlay hero title link. Computed non-text contrast: `brand-600` (`#bc0168`) against black = 3.34:1, clearing the WCAG 1.4.11 floor (3:1) for UI/focus indicators. This is a computed-contrast check, not a literal visual screenshot comparison — noted honestly rather than claimed as a manual visual pass |
| 3 | Nav dropdown reveals on focus and `Tab` flows through its children | PASS by construction; **not empirically exercised this session** | Code inspection: `src/components/Header.tsx:64` — the dropdown `<ul>` uses `group-focus-within:visible group-focus-within:opacity-100`, a pure-CSS disclosure with no JS, so any focus (keyboard or otherwise) landing on the top-level link reveals the dropdown before `Tab` can reach its children. A live driven check was attempted but the current Neon seed has **0** menu items with children (`header nav[aria-label="الأقسام"] li:has(ul)` count = 0 at time of writing) — so this specific item could not be empirically driven this session; the CSS mechanism itself is unconditional and does not depend on seed data being present, but that claim rests on inspection, not a live observation, and is reported as such |
| 4 | `Esc` collapses the consent Customize panel; banner stays open | PASS | Automated e2e test `tests/e2e/a11y.e2e.spec.ts:145` ("Esc collapses the Customize panel but keeps the banner") |
| 4a | Consent dialog: focus moves in on open / focus returns to the footer trigger on close | PASS | Automated e2e tests `tests/e2e/a11y.e2e.spec.ts:136` ("moves focus into the dialog when it opens") and `:155` ("returns focus to the footer trigger after reopen + choose") |
| 5 | Reduced motion neutralizes the card hover-zoom | PASS | **Driven check**: `page.emulateMedia({ reducedMotion: 'reduce' })` (Playwright's native `prefers-reduced-motion` emulation), then measured computed `transition-duration` on a `group-hover:scale-105` card image. Baseline (no emulation): `0.5s` (matches Tailwind's `duration-500`). Under emulation: `1e-05s` (≈0.01ms) — exactly the value `src/app/(frontend)/styles.css:76-85`'s `@media (prefers-reduced-motion: reduce) { transition-duration: 0.01ms !important; ... }` sets. Real before/after measurement, not just a rule-exists check |

## Explicit deferrals

- **Field CWV / CrUX / real-user INP** — requires a live deployment; this whole
  pass is necessarily **lab-only** (Lighthouse against a local `next start`).
  Deploy itself is separately deferred (wrong Vercel account connected; tracked
  in memory as `vercel-deploy-deferred`).
- **Lighthouse-in-CI** — deliberately not wired up. Asserting against a real
  deployed URL post-cutover is more meaningful than a synthetic CI runner
  measuring `next start`; `pnpm lighthouse` stays a local, on-demand script.
- **Payload admin a11y** (`/admin/*`) — upstream `@payloadcms/ui` concern;
  internal editorial users only, not a launch-facing public surface.
- **Trapping-modal consent banner** — deliberately rejected, not overlooked.
  The banner is a non-obscuring bottom overlay (the page stays scrollable and
  interactive behind it), so `aria-modal` + a focus trap would misrepresent it
  to assistive tech and be worse UX than the shipped non-modal behavior
  (focus-in, `Esc`-collapse, focus-return).
- **Full WAI-ARIA menubar rebuild** for the nav — the CSS-only
  `group-focus-within` disclosure is already keyboard-operable (see sweep item
  3); a `role="menubar"`/`aria-expanded` rebuild would require turning the
  server-rendered `Header` into a client component for no measured benefit.
  Revisit only if the menu grows deep enough to need real disclosure semantics.

**Follow-up (surfaced to the user, not part of this plan):**
`tests/e2e/frontend.e2e.spec.ts` is a stale Payload-scaffold test — it asserts
`await expect(page).toHaveTitle(/Payload Blank Template/)` and a heading of
"Welcome to your new project.", neither of which exist on the real site, so it
will always fail if the full e2e suite is ever run instead of the targeted
`a11y`/`consent` files this project actually uses. Recommend deleting or
rewriting it in a small separate cleanup.

## Verify loop (this task)

```
npx pnpm@10.18.0 exec tsc --noEmit          # clean
npx pnpm@10.18.0 lint                       # 0 errors, 5 pre-existing unrelated warnings (tests/int/media-upload.int.spec.ts)
npx pnpm@10.18.0 build                      # clean; homepage ○ (Static), 0 occurrences of /_next/image in .next/server/app
npx pnpm@10.18.0 exec playwright test a11y --config=playwright.config.ts   # 23/23 passed
```

The a11y gate's first run against a freshly-started dev server hit 4 timeouts
(cold `next dev` on-demand route compilation for `/`, article, category, video
watch, each compiled for the first time that session) — a dev-server warm-up
characteristic, the same class of artifact as the Lighthouse cold-Neon warmup
above, not a regression. A second run against the now-warm server passed 23/23
in 4.2 minutes.
