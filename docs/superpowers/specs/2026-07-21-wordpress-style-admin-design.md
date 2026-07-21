# WordPress-style admin for Lalla Fatema

**Date:** 2026-07-21
**Status:** approved

## Problem

The editorial team are non-technical journalists. Payload's default admin is
clean but unfamiliar to them. Many have used WordPress. Making the admin look and
feel like the WordPress dashboard trades on that familiarity to reduce friction.

## Decisions (from brainstorming)

- **Colour:** WordPress structure with the Lalla Fatema brand accent — a dark
  sidebar, but magenta (`#bc0168`) where WordPress uses blue.
- **Scope:** the whole admin chrome (sidebar, top bar, buttons, list tables, edit
  screens), including per-item icons in the menu.
- **Editor:** the simplified journalist post screen gets matching styling too;
  no field or logic changes.

## Approach

Retheme through `src/app/(payload)/custom.scss`, which is imported into Payload's
root layout. Payload's admin is themed entirely with CSS custom properties, so
overriding those variables plus a set of targeted rules reshapes the chrome
without replacing any Payload component. Icons are injected with CSS
`::before` on nav links matched by their `href`. The dashboard landing panel is
the existing `BeforeDashboard` React component, extended.

This deliberately avoids replacing Payload's `Nav`, list, or edit components:
that would mean reimplementing autosave, live preview, collapse behaviour and
active-state logic, and would break on the next Payload upgrade. CSS + the two
components already maintained (`BeforeDashboard`, and the theme file) are the
whole surface.

## Brand values (already defined in the frontend)

- Primary accent: `#bc0168` (brand-600); hover `#9c0556` (brand-700)
- Sidebar background: `#23112c` — the site's existing dark magazine-band colour,
  so the admin quietly matches the public site
- Peach surface `#fbc490` and the rest of the brand scale are available but not
  central here.

## Components

### 1. Sidebar (`custom.scss`)

- Background `#23112c`, light text.
- Each nav link gets an emoji icon via `::before`, matched on the collection/
  global slug in its `href` (e.g. `a[href$="/collections/posts"]`). A fallback
  icon covers any unmatched link so nothing renders icon-less.
- Active link: magenta inline-start edge bar (`#bc0168`) + slightly lighter
  background, mirroring WordPress's active menu row.
- Group labels (المحتوى، التصنيف…) restyled as small muted headers.
- Hover: subtle lightening.

### 2. Chrome & accents (`custom.scss`)

- Primary buttons and links use `#bc0168`.
- Top bar stays light with the existing logo.
- Focus rings tuned to brand.

### 3. Dashboard landing (`BeforeDashboard.tsx`)

Extend the existing component with a WordPress-style "لمحة سريعة" overview:

- A stat strip: published article count, draft count, category count, media
  count — each read server-side via `payload.count`, scoped by the same role
  rules already in the component (journalists see their own draft count).
- A prominent primary "✍️ اكتب مقالاً جديداً" action.
- The existing quick-create, shortcuts and "مسوّداتي" list retained.

The component already runs server-side with `payload` + `user` available, so the
counts need no new data layer.

### 4. List tables (`custom.scss`)

WordPress-table polish: clean header row, row-hover highlight, comfortable
spacing. CSS-only; no change to columns or behaviour.

### 5. Post editor (`custom.scss`)

The simplified journalist screen gets matching polish: the sidebar publish area
reads like WordPress's "Publish" box; buttons and spacing align to the theme. No
field or logic changes — the friendly-editor work stands untouched.

## Testing

- Visual: screenshots of login, dashboard, a list view, and the post editor,
  captured against the running dev server, in both light and dark Payload themes.
- Regression: the existing `tests/e2e/admin.e2e.spec.ts` and
  `tests/e2e/editor-journalist.e2e.spec.ts` suites must still pass — the retheme
  must not change any DOM selector they rely on.
- `pnpm lint` and `pnpm build` clean.

## Out of scope

- No changes to collection data, fields, or access logic.
- No replacement of Payload components; no new dependencies.
- No change to the public-facing site.

## Risks

- **CSS icon injection depends on nav-link `href` structure.** If a future
  Payload version changes nav markup, icons could detach (the chrome still
  works; only the icons would be missing). Accepted: icons are cosmetic and the
  selector is simple.
- **Theme-variable names are Payload-internal.** Pinned to the installed
  version (3.85.1); revisit on a major Payload upgrade. The retheme is additive
  and fully reversible by emptying one file.
