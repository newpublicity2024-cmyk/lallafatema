# Homepage video band → the Lalla Fatema YouTube channel, auto-synced

**Date:** 2026-10-15
**Status:** implemented

## The question that started this

The owner asked a conditional: *if the homepage video section shows videos from the
articles, switch it to YouTube; if it already shows a YouTube channel, add auto-sync.*

Measured before touching anything: **it showed videos from the articles.**
`src/app/(frontend)/page.tsx` fed the band from `getLatestVideoPosts(5)`, which queries
`posts where featuredType = 'video'` (79 published at the time). There was no YouTube
channel integration anywhere in the repo — no channel id, no sync, `site_settings_social`
empty, and the standalone `videos` collection retired and hidden since video became an
article property.

So the first branch applied, and the second branch described the end state the owner
wanted. Both were built.

## Decisions (confirmed with the owner before implementation)

| Decision | Choice | Why it mattered |
|---|---|---|
| Channel | `UCgJShJYlHW79y-ETvEqTI9w` — "LALLA FATEMA TV لالة فاطمة" | The magazine's own channel; it links back to lallafatema.ma and has published since 2013. Verified against the live feed, not guessed. |
| Shorts | Excluded | 9 of the 15 most recent uploads are Shorts. The band is a 16:9 lead + list; unfiltered it would be mostly letterboxed portrait video. |
| `/videos` listing | Switched to the channel too | The band's "المزيد" link points there. A "see all" that leads to a different set of videos is a broken promise. |
| Source | RSS now, Data API when a key appears | RSS needs no credentials, so the feature works the moment it deploys rather than waiting on a Google Cloud project. |

## Shape

```
YouTube channel
   │  RSS (default, no credentials, latest 15)   ── src/lib/youtube-source.ts
   │  Data API v3 (when YOUTUBE_API_KEY is set, full catalogue + durations)
   ▼
parseChannelFeed()                                ── src/lib/youtube.ts   (pure, no I/O)
   ▼
syncChannelVideos()  upsert on videoId            ── src/lib/youtube-sync.ts
   ▼
youtube-videos collection                         ── src/collections/YoutubeVideos.ts
   ▼
getLatestChannelVideos() / getChannelVideos()     ── src/lib/queries.ts
   ▼
VideoSection → YoutubeVideoBand (homepage)        ── click-to-load, nocookie
YoutubeVideoGrid (/videos)
```

Driven by `GET /sync-youtube` every 30 minutes (`vercel.json`), sharing its authorisation
with `/publish-due` via `src/lib/cron-auth.ts`.

## The decisions inside the implementation worth knowing

**Mirror into the database; do not fetch while rendering.** Three reasons, in order of
weight: a YouTube outage would otherwise become a homepage outage (and an ISR revalidation
landing during the blip would bake an empty band in for an hour); the RSS feed has no
pagination, so `/videos` could not page without our own store; and editors get a veto on an
individual upload.

**Revalidate only when something a reader can see changed.** `revalidatePath('/', 'layout')`
purges the ISR cache for the whole site, not just the band, so the endpoint calls it only
when `syncChannelVideos` reports `changed > 0`. At 48 ticks a day against a channel that
posts a handful of times, revalidating unconditionally would throw the cache away for
nothing. This mirrors the care `/publish-due` already takes.

The "a reader can see" qualifier was added after the first production run and is the
difference between the design working and merely looking like it works. `views` is stored
and shown in the admin but rendered nowhere on the site, and it moves constantly — measured
on the live channel, a video went from 167 to 169 views inside a minute. Counting it as a
change made the very first production sync report `changed: 4`, which would have meant a
whole-site cache purge on nearly every half-hourly tick. `RENDERED_FIELDS` in
`youtube-sync.ts` now drives `changed`; a views-only delta is still written, it just does
not claim the cache is stale.

**Never delete on absence.** A video missing from a sync payload is left alone. The RSS
window is 15 items, so "absent" overwhelmingly means "older than the window" — a sync that
pruned on absence would wipe the archive the first time it ran against RSS after an API
run. Removal is the `hidden` flag, or a delete in the admin.

**`hidden` is the only editor-owned field.** Everything else is overwritten by the next
sync and is therefore read-only in the admin: an editor who retitled a video would
otherwise watch the edit revert half an hour later. `syncChannelVideos` never includes
`hidden` in an update.

**Rebuild every URL; reflect nothing.** Titles, descriptions and thumbnail URLs in a feed
are text chosen by whoever uploaded the video, and all of it reaches rendered HTML. The
video id is the only value carried forward, it is charset-validated, and every URL is
rebuilt by `parseEmbed` from a hard-coded origin. That also means the band's iframes
inherit the `youtube-nocookie.com` origin the CSP already allowlists — one parser, so the
band cannot drift from the article embeds into a blank frame in production.

**No iframe until the reader clicks.** Five YouTube iframes above the fold is megabytes of
third-party JavaScript and profiling cookies on load. The band renders posters and creates
exactly one frame, on demand — the same facade `VideoPlayer` uses for article headers.

**Playing in place rather than linking out.** A channel video has no article to open.
Linking to youtube.com would hand the magazine's most valuable above-the-fold slot to
YouTube, so choosing a list item promotes it into the lead frame instead — the playlist
interaction readers already know, and still only one iframe however much they click.

**Shorts detection differs by source, deliberately.** RSS states it (`/shorts/<id>`
alternate link) and is authoritative. The Data API exposes no Shorts flag at all, so that
path infers it from a duration of 60 seconds or less — conservative, because YouTube now
allows Shorts up to three minutes and treating everything under three minutes as a Short
would hide genuine short interviews. One more reason RSS stays the default.

## Known limits

- **The archive starts small.** RSS carries the latest 15 uploads, which was 6 landscape
  videos at cutover. Nothing is ever deleted, so the listing grows with every new upload.
  Setting `YOUTUBE_API_KEY` backfills the whole back catalogue on the next run, with no
  code change.
- **Punctuality depends on `CRON_SECRET`.** Without it Vercel's scheduler cannot call
  `/sync-youtube`, and the band freezes at whatever the last manual run left. This is a
  harder dependency than it is for scheduled publishing, where an article still surfaces on
  its own at the next ISR expiry.
- **A handle is not accepted as channel configuration.** `@lallafatema` cannot be resolved
  to a channel id without a network round trip, and a parser that sometimes does I/O is a
  trap. Resolve it once by hand and configure the id.

## Out of scope / found in passing

`payload migrate:create` wanted to sweep an unrelated `enum_ads_placement` rebuild into
this migration — dropping the `sidebar` and `popup` values that exist in the production
enum but no longer appear in `src/collections/Ads.ts`. That is real drift from an earlier
unmigrated Ads change. It was removed from the migration by hand and left for a separate,
deliberate decision.
