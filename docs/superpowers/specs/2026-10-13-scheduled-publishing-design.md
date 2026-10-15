# Scheduled ("programmed") publishing from the journalist dashboard

**Date:** 2026-10-13
**Status:** implemented

## Problem

A journalist who needs an article to go out at 14:00 had no way to say so. The publish
date existed — `Posts.publishedAt`, a day-and-time picker — but it carried
`condition: editorialOnly`, so only admins and editors could see it. A journalist's only
option was to sit on a draft and press «نشر» at the right minute.

## The fact that shaped the design

The site already *enforces* scheduling, and has since the `publishedWhere()` fix. One rule
— published **and** due — lives in `src/lib/published-where.ts` and is consumed by every
reader-facing surface:

| Surface | Where the rule is applied |
|---|---|
| Listings (home, category, author, related) | `src/lib/queries.ts` |
| The article URL | `getPostById` → `isScheduledForLater` → `notFound()` |
| REST + GraphQL | `canReadPosts` in `src/access/index.ts` |
| `sitemap.xml` | its own route |
| Meilisearch indexing | `indexPost` / `reindexAllPosts` in `src/lib/search.ts` |

So a post with `_status: 'published'` and a future `publishedAt` is **already** invisible to
the public, and **already** becomes visible on its own when the clock passes it.
`publishing-chain.int.spec.ts` [PC14] has been proving that for months.

That left the feature as an authoring and reporting problem, not a publishing-engine
problem.

## Decisions

### Reuse `publishedAt`; no new column, no job queue

Payload 3.85 ships `versions.drafts.schedulePublish`, which would have been the obvious
choice. It was rejected deliberately:

- it requires the `payload_jobs` tables — a **migration against a Neon instance that dev
  and production share**;
- it needs a cron to execute the queue, and if that cron fails **the article never
  publishes at all**.

Date-gating needs no migration and cannot miss a publish: nothing has to run for an article
to become due. The worst a failed cron costs is cache freshness. Verified with Payload's own
migration diff — the change produces **zero** schema statements touching `posts`.

### A third state, derived rather than stored

`src/lib/schedule.ts` names what the data already expressed:

| State | Stored as |
|---|---|
| `draft` | `_status: 'draft'` |
| `scheduled` | `_status: 'published'` + `publishedAt` in the future |
| `live` | `_status: 'published'` + `publishedAt` past or absent |

Deriving `scheduled` is what let every existing query, hook, page and test stay untouched.
`scheduledWhere()` and the site's `publishedWhere()` are complements over published posts —
asserted structurally, so no article can be in both lists or neither.

### What a journalist now sees

- **`publishedAt` is visible to every role**, relabelled «موعد النشر», with a description
  that says what leaving it blank does and what setting it does. Nothing is protected by
  hiding it: a future date makes the article invisible to the public, so the worst a mistake
  costs is a delay to the writer's own story. `tags`, `authors`, `slug` and SEO keep their
  `editorialOnly` gate, and `authors` keeps its field-level write lock.
- **`SchedulePanel`** (sidebar UI field, all roles) states the outcome in words — «مبرمج
  للنشر · يظهر للزوّار تلقائيًا الخميس 15 أكتوبر، 14:30 (بتوقيت المغرب)» — because a bare
  picker leaves a writer guessing why their article vanished from the site.
- **`lf-scheduled`** dashboard widget, «مبرمج للنشر», between «مسوّداتي» and «نُشر»: the
  newsroom's own reading order (being written → going out next → already out). Soonest
  first, unlike every other card here, because the next thing out is the thing you check.
- **A «مبرمج للنشر» tile** in the numbers strip.

### Fixing what scheduling broke in the dashboard

`publishedWhere()` in `src/components/admin/dashboard/shared.tsx` filtered on `_status`
alone. With scheduling reachable, that became a lie:

- the «مقال منشور لي — على الموقع الآن» tile counted articles no reader could open;
- «نُشر مؤخرًا» sorts `-publishedAt`, so a programmed article sat at the **top** of it with
  a «عرض» link that 404s.

It now carries the due clause, matching the site's own rule. This is part of the feature,
not a side quest: the state did not exist before, so nothing could previously misreport it.

### Punctuality and search: `/publish-due`

Two things do *not* happen by themselves when an article falls due:

1. **Cache.** Pages are ISR (`revalidate` 3600 home/article, 300 category) and the article
   URL's own 404 is cached just as long, so an article due at 14:00 could surface up to an
   hour late.
2. **Search.** `indexPost` runs from the collection's `afterChange` hook, i.e. only when
   somebody saves. An article that becomes due with nobody editing it would never enter
   Meilisearch.

`src/app/(frontend)/publish-due/route.ts` closes both. It finds articles that fell due
inside a window, indexes them, and calls `revalidatePath('/', 'layout')` — the same call
every publish already makes — and does **nothing** when nothing is due, so the ISR cache is
not thrown away on every tick. Secret-gated: Vercel's `Authorization: Bearer $CRON_SECRET`
for the cron, or `?secret=$REVALIDATE_SECRET` by hand.

A time window rather than a stored high-water mark, because a marker would mean a new column
on the shared database and because both actions are idempotent, so overlapping runs are
free.

`vercel.json` runs it every 5 minutes against a 15-minute default window — 3× slack, so one
missed tick still catches up.

### Known limit: the collection list view still says «منشور»

Three surfaces now distinguish a programmed article — the dashboard card, the numbers strip,
and the article's own sidebar. The **list view** (`/admin/collections/posts`) does not: its
`_status` pill reads «منشور», because that genuinely is the document's stored status.

Left alone deliberately. The pill is not lying about the document, `publishedAt` is already
in `defaultColumns` so the future date is visible in the same row, and the surfaces a writer
actually starts from do draw the distinction. Changing it means a custom cell component for
`_status` — new admin UI on a screen this feature otherwise does not touch, for a case the
dashboard already answers. If it turns out to confuse people, that cell is the fix.

### Timezone

`posts.published_at` is `timestamp with time zone`, so the instant a journalist picks is
stored unambiguously; only its *display* needed care. Every label in the admin is formatted
in `Africa/Casablanca` and carries «بتوقيت المغرب», so a time can never be read as the
server's UTC. `timezone: true` on the field was rejected — it would add a `publishedAt_tz`
column, i.e. a migration. Morocco's Ramadan shift to UTC+0 is handled by `Intl` and
regression-tested; a hand-rolled `+1` would be an hour wrong for a month each year.

## Files

- `src/lib/schedule.ts` — the three states, the Where builders, the newsroom clock
- `src/collections/Posts.ts` — `publishedAt` ungated + relabelled; `scheduleState` UI field
- `src/components/admin/SchedulePanel.tsx`
- `src/components/admin/dashboard/Scheduled.tsx`, `shared.tsx`, `Stats.tsx`
- `src/payload.config.ts` — `lf-scheduled` widget + both default layouts
- `src/styles/admin-dashboard.scss` — `.lf-chip--time`
- `src/app/(frontend)/publish-due/route.ts`, `vercel.json`, `.env.example`
- `tests/int/schedule.int.spec.ts`, `tests/int/schedule-chain.int.spec.ts`,
  `tests/int/publish-due.int.spec.ts`, `tests/e2e/schedule.e2e.spec.ts`

## Superseded contract

`tests/e2e/editor-journalist.e2e.spec.ts` asserted `#field-publishedAt` was **not** visible
to a journalist. That assertion was *replaced*, not deleted, with a comment recording why,
so a future change that quietly re-hides the field fails there instead of silently removing
the feature.

## One owner action remains

Set **`CRON_SECRET`** in the Vercel project. Vercel then sends it as a bearer token on its
own cron invocations of `/publish-due`, which is what makes an article appear at its exact
minute and reach the search index.

Without it the feature still **works** — the article becomes readable on its own — but
surfaces at the next ISR expiry (up to an hour) and waits for its next edit to be
searchable. `*/5 * * * *` also needs a Vercel plan that allows minute-level crons; on a plan
limited to daily crons, either widen the schedule and pass `?minutes=` to match, or accept
ISR-paced visibility.

Catch up a missed window by hand:
`/publish-due?secret=$REVALIDATE_SECRET&minutes=1440`.

## Test discipline this feature had to learn the hard way

While building it, an integration fixture was created as **published with a date two
minutes in the past** — which is, by definition, a live article — on the Neon instance dev
and production share. It appeared on the real homepage, and deleting the row did not remove
it: Next's ISR had cached the HTML, which had to be purged with a production redeploy.

The rule now written into all three specs: **a test may never leave a post the public can
read.** Every fixture is published with a *future* date, which the site's own rule makes
invisible to everyone but its author. Where a test needs to observe something a reader *can*
see, it borrows an already-live article from the corpus, read-only, instead of creating one.

The single exception is the negative control that must watch a post cross its moment. It
back-dates by **years**, not minutes — every listing sorts `-publishedAt` with a limit, so a
2015 date cannot reach the homepage, a category page or the feed — and reverts in a
`finally` after four fast queries.

Worth knowing: `publishing-chain.int.spec.ts` [PC14] does a briefer version of the same
transition, and predates this feature.

## Two pre-existing problems found while building this

Neither is caused by scheduled publishing and neither was touched. Both are recorded because
they cost real time here and will cost it again.

### 1. Frontend pages hung in dev — found here, FIXED ON ITS OWN BRANCH

> Shipped separately as `fix/richtext-converter-elements`, because it is a renderer bug with
> nothing to do with scheduling. It is written up here because this is where it was found.

`GET /` never returned in `pnpm dev` (measured 15.4 minutes, then a 500), and so did roughly
one article in nine. The log said:

```
Attempted to render <br key="1"> without development properties.
⨯ TypeError: Cannot read properties of undefined (reading 'stack')  at stringify
```

**Cause, confirmed by experiment.** Payload ships some JSX converters as a pre-built React
*element* rather than a function — `linebreak` is literally `_jsx("br", {})`, a constant
created at module load. `alignAll` in `RichTextBody.tsx` (added by the text-alignment work,
PR #7) treated every non-function object as a nested converter map and rebuilt it from
`Object.entries`. That rebuild keeps `$$typeof`, so the result still passes `isValidElement`
and still renders — but it drops the properties that are not enumerable: `ref`,
`_debugInfo`, `_debugStack`, `_debugTask`.

Production React never reads those, which is why the live site has been serving these
articles correctly all along. Next's RSC serializer does read them, refuses, then fails to
serialise its own error — so the request hangs instead of returning.

**Blast radius, measured:** 168 of 1,575 published articles contain a `linebreak` node
(10.7%). Correlation was exact on the four articles sampled: the two with linebreak nodes
500'd, the two without served 200.

**Fix:** one condition — `alignAll` skips React elements (`!isValidElement(value)`) and
passes them through untouched. After it, the homepage renders in 2.1s and both previously
hanging articles return 200 in about a second.

**Guarded by** `rich-text-body.int.spec.tsx`, asserted STRUCTURALLY (the element must come
out as the same object) rather than by rendering. A rendering test was written first and
discarded because it passed with the bug still present: neither `@testing-library/react` nor
`renderToStaticMarkup` performs that check, only the RSC path does. The structural test was
verified against a positive control — with the fix reverted it fails with
`expected { …(6) } to be { …(10) }`, the four lost properties.

**Knock-on, also measured.** `src/proxy.ts` fetches `/redirects-map.json` on every frontend
request, and dev has no ISR cache for it. While requests were hanging this produced 135 map
fetches for 4 page loads and latencies up to 3.6 minutes, which saturated the dev server and
was what wedged it (including a week-old dev server found listening on :3100 and answering
nothing). With the hang fixed it settles to about 1.4 fetches per page load at ~350ms. Still
not free — each is a real database query in dev — so a short-lived module-level cache in
`proxy.ts` would be worth having, but it is no longer a problem.

### 2. Un-migrated schema drift in `ads`

`src/collections/Ads.ts` dropped the `sidebar` and `popup` placement options without a
migration, so the config and the Neon schema disagree about `enum_ads_placement` (6
outstanding statements, surfaced by this feature's G7 check). The next `migrate:create` for
any reason will pick it up.
