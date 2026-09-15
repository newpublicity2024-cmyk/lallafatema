# Journalist-first admin dashboard

**Date:** 2026-09-15
**Status:** implemented (supersedes `2026-07-21-wordpress-style-admin-design.md`)

## Problem

The admin read like an IT console: a dark sidebar listing every collection and
global (including ones a journalist can only look at), a landing page of
"collection cards" grouped by schema, database-flavoured counts (categories,
media files), an `API` tab on every document, and a publish button that only
ever produced a 403 toast for journalists. It was built for both roles but
tuned for neither.

## Decisions

- **One admin, two default views.** The landing page is composed from Payload
  3.85's modular dashboard widgets with a per-role `defaultLayout`. A journalist
  sees: greeting + "write" CTA, their own numbers, their drafts, their published
  pieces, a 3-step guide, two shortcuts (images, account). An editor/admin sees:
  the review queue, newsroom numbers, what just went live, and plain-language
  shortcuts into curation (homepage, ads, menu, team…). Users can still
  rearrange or add widgets (Payload's stock "collections" cards stay registered).
- **Journalists only see what they use.** `admin.hidden` (a shared
  `hiddenFromJournalists` predicate) removes Categories, Tags, Pages, Magazine
  issues, Redirects, Users, Homepage and Main menu from their nav, dashboard and
  routes. Their nav is now *Articles* and *Image library*. Access rules are
  unchanged — this is visibility, not permission.
- **No publish button for journalists.** `Posts.admin.components.edit.PublishButton`
  renders a "saved automatically · the editor publishes after review" note for
  them and Payload's stock button for editors/admins.
- **`hideAPIURL: true` everywhere.** The API tab is gone from every document.
- **Light theme.** White sidebar with masked SVG icons and a soft-magenta active
  row, a barely-warm page ground with white cards, Tajawal (self-hosted, same
  face as the public site), a 14px root so Payload's rem scale breathes,
  coloured draft/published pills in lists, rounded controls. Still purely CSS
  over Payload's own components (`src/app/(payload)/custom.scss` +
  `src/styles/admin-dashboard.scss`); no component is forked.

## Files

- `src/components/admin/dashboard/*` — widgets (server components) + `shared.tsx`
- `src/components/admin/PublishButton.tsx`
- `src/payload.config.ts` — `admin.dashboard.{widgets,defaultLayout}`
- `src/access/index.ts` — `hiddenFromJournalists`
- `public/fonts/tajawal/` — woff2 (OFL)

## Notes

- On viewports ≤1440px Payload force-closes the sidebar on load (its own
  breakpoint logic); the dashboard's shortcut tiles and the breadcrumb are the
  navigation there, and the toggle is styled to read as a button.
- The editor's review queue skips untitled drafts: opening "create" autosaves an
  empty document, and those would otherwise bury real articles.
- The e2e login helper asserts on the welcome heading containing "أهلًا"; the
  Welcome widget keeps that word.
