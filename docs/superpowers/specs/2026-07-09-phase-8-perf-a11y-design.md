# Phase 8.3 — Perf & A11y Passes (Design)

**Date:** 2026-07-09
**Status:** Approved (design), pending spec review
**Sub-project:** Phase 8 (hardening & launch), item #3 of 5

## Problem

The site has never been measured against Core Web Vitals or an accessibility rule set, and
there is no regression guard for either. The fundamentals are already good — LCP images carry
`priority` with tuned `sizes` ([PostCard.tsx:85](../../../src/components/PostCard.tsx#L85),
[ArticleView.tsx:58](../../../src/components/ArticleView.tsx#L58)), images reserve their
aspect ratio (zero-CLS `fill` pattern), heavy embeds are behind facades, fonts are self-hosted
via `next/font`, and the CSS baseline already ships `:focus-visible` outlines and a global
`prefers-reduced-motion: reduce` block ([styles.css:71-85](../../../src/app/(frontend)/styles.css#L71-L85)).
But a survey found concrete gaps: **no skip-to-content link** (no `sr-only` helper anywhere),
**sub-threshold text contrast** (`text-zinc-400` timestamps ≈ 2.6:1 on white, below the 4.5:1
AA floor), and a **consent dialog with `role="dialog"` but no focus handling** (no focus-move,
no `Esc`, focus not returned to its trigger). Pre-launch, these should be measured and fixed,
and locked so they don't regress.

## Goal

A pragmatic **measure-and-fix-to-a-bar** pass over the public site: establish a measured
Lighthouse (lab) + axe-core baseline, fix every concrete finding, and land a lightweight axe
regression gate in the existing Playwright suite — delivered with **no database schema change**
and **no new runtime dependency** (axe + Lighthouse tooling are devDependencies only), without
regressing the site's static/ISR rendering.

The bar:
- **axe-core: zero violations** (WCAG 2.0/2.1 level A + AA rule tags) on the representative routes.
- **Lighthouse (lab): Accessibility ≥ 95 and Performance "green" (≥ 90)** on the key routes.
- **Manual keyboard sweep** passes (home, article, consent flow).

## Scope

**Representative route set (7)** — measured by Lighthouse and gated by axe:
1. `/` (homepage — static)
2. an article `/[category]/[slug]-[id]` (dynamic)
3. a category `/[category]`
4. a video watch page `/videos/[slugId]`
5. `/magazine` (archive) + one issue `/magazine/[issueNumber]` (PDF facade)
6. `/search`
7. one static page `/about` (`<PageView>`)

**In scope (a11y fixes):**
1. Skip-to-content link + centralized `<main id="main">`.
2. Text-contrast fixes to meet AA (≥ 4.5:1 body text; ≥ 3:1 large/UI).
3. Consent-dialog focus handling (non-modal: focus-move-in, `Esc` collapses Customize,
   focus-return to trigger).
4. Verify (not rebuild) nav-dropdown keyboard access, reduced-motion, and focus-visible coverage.

**In scope (perf):**
- Measure Lighthouse against `next start` for the route set; confirm LCP/CLS/INP; fix only
  what is measured to be wrong (no speculative perf work).

**In scope (tooling):**
- `@axe-core/playwright` gate in `tests/e2e/` (the CI/regression guard).
- Re-runnable local Lighthouse (`pnpm lighthouse`) — **not** wired to CI.
- A perf/a11y report note.

**Out of scope / deferred (YAGNI or wrong phase):**
- **Payload admin a11y** — upstream (`@payloadcms/ui`) concern; internal users, not launch-facing.
- **Field CWV / CrUX / real-user INP** — requires a live deployment; deploy is deferred
  (wrong Vercel account). This pass is **lab-only** by necessity.
- **Lighthouse-in-CI** — deferred to post-deploy; asserting against the real URL beats a noisy
  CI runner measuring a synthetic `next start`. Rejected deliberately, not overlooked.
- **Full WAI-ARIA menubar** for the nav — the CSS disclosure is already keyboard-accessible; a
  `role="menubar"` rebuild would add client JS to a clean server component for no real gain.
- **Trapping-modal consent banner** — a bottom overlay that doesn't obscure the page should not
  trap focus; making it `aria-modal` would be worse UX (see Architecture §3). Rejected deliberately.
- Any deployment — work stays local, merged to `main` unpushed (project cadence).

## Design principles

- **Measure before fixing.** Lighthouse + axe establish a baseline first; fixes are driven by
  real findings, and the perf section confirms-green rather than inventing work.
- **Lock every fix.** Each discrete a11y fix ships with a test that would fail without it — the
  axe spec for rule-level regressions, targeted Playwright assertions for keyboard/focus behavior.
- **ISR-safe.** No fix introduces per-request rendering or a client component where a server one
  exists today (the skip link and contrast fixes are markup/CSS; the consent work stays inside
  the already-client `ConsentBanner`).
- **RTL-correct.** All new markup uses logical properties and inherits `dir="rtl"`; the skip link
  and focus styles are verified in RTL.
- **Honest about limits.** CWV here is lab-only; the report says so and defers field data +
  Lighthouse-in-CI to post-deploy rather than implying coverage it can't give.

## Architecture

### §1 — Skip-to-content link + centralized `<main>`

Today every page renders its own `<main>` (homepage [page.tsx:95](../../../src/app/(frontend)/page.tsx#L95),
[ArticleView.tsx:19](../../../src/components/ArticleView.tsx#L19), [PageView.tsx:13](../../../src/components/PageView.tsx#L13),
and the category/video/magazine/author pages), each carrying its own layout classes
(e.g. `lf-container py-8`, `mx-auto max-w-[1000px]`). There is exactly one `<main>` per page
(valid), but no shared skip target.

**Centralize the landmark.** The frontend layout ([layout.tsx:67](../../../src/app/(frontend)/layout.tsx#L67))
currently wraps children in `<div className="flex-1">`. Change that to
`<main id="main" className="flex-1">`, and convert each page's `<main>` to a plain wrapper
(`<div>` / `<section>`), moving its layout classes onto that wrapper. Result: exactly one
`<main id="main">`, defined once, wrapping all page content.

**Skip link.** As the **first focusable element** in `<body>` (before `ConsentMode`/`Header`),
add:

```tsx
<a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[200] focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white">
  تخطَّ إلى المحتوى
</a>
```

`sr-only` / `not-sr-only` are core Tailwind v4 utilities (no custom CSS). `focus:start-2`
keeps it RTL-correct. On `Enter` it jumps focus to `#main`.

### §2 — Text contrast

Audit and fix every text token below its WCAG AA threshold on its actual background:

| Location | Current | Contrast (approx) | Fix |
|---|---|---|---|
| Timestamps (`RelativeTime`) in cards/article | `text-zinc-400` (#a1a1aa) on white | ≈ 2.6:1 ❌ | → `text-zinc-500` (#71717a ≈ 5:1 ✔). Verify each usage. |
| Overlay date over hero gradient | `text-white/70` | measure at the darkest gradient stop (`from-black/80`) | keep if ≥ 4.5:1, else `text-white/90` |
| Any other sub-threshold body text surfaced by axe/Lighthouse | — | — | bump to the nearest passing token |

Large text (≥ 24px, or ≥ 18.66px bold) and UI/non-text elements use the 3:1 floor.
Focus outline (`brand-600` on white ≈ 5.4:1) already passes. Exact values are re-measured at
implementation with a contrast checker, not eyeballed. Fixes are token swaps — minimal visual
shift (timestamps a shade darker).

### §3 — Consent-dialog focus handling (non-modal)

`ConsentBanner` ([ConsentBanner.tsx:69](../../../src/components/ConsentBanner.tsx#L69)) is a
fixed **bottom overlay** that does not cover or block the rest of the page — the reader can keep
scrolling and interacting. That makes it a **non-modal disclosure**, not a modal dialog, so it
must **not** trap focus (`aria-modal="true"` + a focus trap would be misleading and worse UX for
a cookie banner). Keep `role="dialog"` + its Arabic `aria-label`; add the focus affordances a
keyboard/SR user needs:

- **Focus-move-in on first appearance.** When the banner opens because no prior choice exists,
  move focus to the dialog container (or its first actionable control) so it's discoverable. Use a
  ref + `focus()` in the existing open effect. (A `tabIndex={-1}` on the container makes it
  programmatically focusable without adding it to the tab order.)
- **`Esc` collapses the Customize panel** (the previously-deferred item): when `customizing` is
  true, `Esc` sets it false; the banner itself stays (a first-run visitor must still make a choice).
- **Focus-return to trigger.** When the banner is **reopened from the footer**
  `CookieSettingsButton` (the `lf:open-consent` event) and then closed via a choice, return focus
  to that button. The button dispatches the event; the banner signals "closed" so focus can return
  (e.g. the button listens for a `lf:consent-closed` event, or focuses itself after dispatch on the
  next choice). Exact wiring verified at implementation; dependency-free.

No focus trap, no backdrop, no scroll-lock. This is the smaller, lower-risk, and more correct
change for this pattern.

### §4 — Verify-only items

These are surveyed as already-acceptable; the work is confirmation + a locking assertion, not a
rebuild:

- **Nav dropdown** ([Header.tsx:64](../../../src/components/Header.tsx#L64)) — the submenu is
  `visibility:hidden` until `group-hover`/`group-focus-within`. Keyboard path works: focusing a
  top-level link makes `group-focus-within` true → submenu becomes visible → its links enter the
  tab order → Tab flows in; tabbing out hides it again. Keep it a **CSS-only server component**;
  the axe spec confirms no violation. `aria-expanded`/`Esc` would require converting `Header` to a
  client component — out of scope.
- **Reduced-motion** — the global block ([styles.css:76](../../../src/app/(frontend)/styles.css#L76))
  neutralizes the hover `scale-105` image transforms and any transition; confirm no
  motion-triggering property is added by the fixes above without a reduced-motion path.
- **`:focus-visible`** — present globally; confirm the skip link and all interactive controls show
  a visible focus ring (including over dark hero overlays — verify the outline is visible there or
  add a light-on-dark variant if axe/manual flags it).

### §5 — Perf / CWV (lab), measure-and-confirm

Run Lighthouse against a production build (`next start`) for the route set and verify:

- **LCP** — the homepage LCP element is the hero overlay image, which already carries `priority`
  and `sizes="(max-width: 768px) 100vw, 66vw"`; confirm no render-blocking resource delays it and
  the served size is right. Confirm article/video/magazine LCP images likewise.
- **CLS** — confirm ≈ 0: images reserve ratio, ad slots reserve fixed height per placement, the
  consent banner is a fixed overlay (no reflow). Watch for any font-swap shift (`next/font` applies
  `size-adjust`; confirm).
- **INP / TBT** — interactivity is minimal (consent banner, share buttons, facades, newsletter);
  confirm no long tasks and that consent-gated ad/GTM scripts stay off the critical path (they load
  post-hydration / on idle by existing design).
- **Fix only what's measured.** Any real finding (unexpected render-blocking, mis-tuned `sizes`,
  a shift source) gets a targeted fix; otherwise this section is a documented green baseline. No
  speculative perf work.

### §6 — Tooling

- **axe gate (regression guard):** add `@axe-core/playwright` (devDependency) + a new
  `tests/e2e/a11y.e2e.spec.ts`. For each representative route: `page.goto(...)`, wait for load,
  run `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`,
  assert `results.violations` is empty (on failure, print the violation summary for triage). Runs
  in the existing `pnpm test:e2e` loop against the dev server (`webServer: pnpm dev`, :3000).
  For the consent flow, dismiss/interact with the banner as the other e2e specs already do.
- **Re-runnable Lighthouse (local only):** add `@lhci/cli` (devDependency) + `.lighthouserc.json`
  + a `"lighthouse"` package script. It builds, starts `next start`, runs Lighthouse (median of a
  few runs) over the route set, and asserts the local thresholds (a11y ≥ 0.95, performance ≥ 0.90)
  as **warnings/local gate — not** in GitHub Actions. Leaner alternative if the lhci dep is
  unwanted: a small `scripts/lighthouse.mjs` using the `lighthouse` + `chrome-launcher` packages
  directly; default is lhci for less custom code.
- **Report:** `docs/superpowers/notes/2026-07-09-perf-a11y-report.md` — baseline scores, final
  scores, the list of fixes, and the manual keyboard-sweep checklist (matching the
  `2026-07-08-rbac-audit.md` note pattern).

## Testing

- **E2E — axe** (`tests/e2e/a11y.e2e.spec.ts`): zero axe violations on each of the 7 representative
  routes (WCAG A/AA tags). This is the enforce gate.
- **E2E — keyboard/focus** (in the a11y spec or the existing `consent.e2e.spec.ts`):
  - Tab from the top of the page: the **first focusable element is the skip link**, and activating
    it moves focus to `#main`.
  - Opening the consent banner (fresh session) **moves focus into the dialog**.
  - With the Customize panel open, **`Esc` collapses it** and the banner remains.
  - Reopening consent from the footer button and choosing an option **returns focus to that button**.
- **Integration** (`tests/int/`, if a pure unit is warranted): none strictly required — the fixes
  are markup/CSS/behavior best covered by e2e. Add a small unit only if a pure helper is extracted.
- **Manual (documented in the report):** keyboard-only sweep of home + article + consent; a
  reduced-motion check (`prefers-reduced-motion`) confirming hover transforms are neutralized.
- **Verify loop (project standard):** `tsc --noEmit` + `eslint .` + `pnpm build` clean; homepage
  still `○ Static` (ISR intact) and `0 /_next/image`; local `pnpm lighthouse` meets the bar.

## Success criteria

1. A skip-to-content link is the first focusable element and jumps to a single centralized
   `<main id="main">`; exactly one `<main>` per page.
2. axe-core reports **zero violations** (WCAG A/AA) across all 7 representative routes, enforced by
   `tests/e2e/a11y.e2e.spec.ts`.
3. All body text meets **≥ 4.5:1** (≥ 3:1 large/UI) — no `text-zinc-400`-on-white timestamps remain.
4. The consent banner moves focus in on open, `Esc` collapses Customize, and focus returns to the
   footer trigger on reopen-then-close — verified by e2e; it remains **non-modal** (no focus trap).
5. Local Lighthouse shows **Accessibility ≥ 95 and Performance ≥ 90** on the key routes, recorded in
   the report; any perf fix made was driven by a measured finding.
6. `pnpm lighthouse` is re-runnable locally; **no** Lighthouse job added to CI.
7. Reduced-motion and `:focus-visible` coverage confirmed (including the skip link and dark-overlay
   focus visibility).
8. No schema/migration change, no new **runtime** dependency (axe + lhci are devDependencies);
   `tsc` + `eslint` + `pnpm build` clean; new e2e specs pass; ISR intact.

## Follow-ups (not this spec)

- **Lighthouse-in-CI** against the real deployment, post-cutover (field-meaningful, less noisy).
- **Field CWV** — wire a CrUX/real-user-INP readout once the site is live (feeds a real INP number
  the lab can't give).
- Optional `aria-expanded` + `Esc` nav dropdown **if** the menu grows deep enough to warrant a
  client-side disclosure (revisit only with a real need).
- `reserved-slug-guard` follow-up (tracked in memory) — unrelated to a11y/perf, still open.
