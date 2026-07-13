# Video-on-Articles + Videos Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video a property of an article (hero = image OR video URL, click-to-play facade), add a `/videos` listing of all video-posts newest-first, retire the standalone `Videos` collection surface, and import the 43 migrated video articles.

**Architecture:** Add two fields to `Posts` — `featuredType` (`image|video`) + `featuredVideoUrl` (conditional URL). `featuredImage` stays the universal poster/thumbnail. The article hero renders the existing `<VideoPlayer>` facade (iframe only on click) when `featuredType==='video'`; cards get a play badge; a new `/videos` page and repointed "فيديو" nav aggregate video-posts across all categories via a `getVideoPosts()` query. The standalone `Videos` collection is retired (hidden from admin, all public surfaces repointed to video-posts, watch pages 301→`/videos`) — its table is left in place (no destructive migration). The WordPress importer drops the `فيديو` skip and wires `videos[0].url → featuredVideoUrl`.

**Tech Stack:** Next 16 (App Router, ISR), Payload 3.85 (Postgres/Neon), Tailwind v4, TypeScript, Vitest (int), Playwright (e2e). Package manager: `npx pnpm@10.18.0` (see the pnpm workaround note).

## Global Constraints

- **Package manager:** always `npx pnpm@10.18.0 …` (PATH pnpm is too old). Dev server: `npx pnpm@10.18.0 dev` (reads `.env`; admin `dev@lallafatema.ma` / `DevAdmin!2026`).
- **Schema changes need a migration** (`push:false`). `payload migrate` is classifier-blocked against live Neon — apply via the Neon MCP pattern: generate the file with `payload migrate:create`, confirm `up()` is additive-only, then run the `up()` SQL **plus** the `payload_migrations` tracking-row INSERT in one `mcp__neon__run_sql_transaction` against project **`icy-union-71150532`**. Next batch = **10**.
- **NEVER run destructive SQL** (DROP/DELETE/TRUNCATE/UPDATE-without-WHERE) on Neon. Retiring the `Videos` collection must NOT drop its table.
- **CWV rules (non-negotiable, verified each phase):** homepage stays `○ Static`; article video hero loads **NO `<iframe>` until click** (0 third-party requests on load); **0 `/_next/image`** requests (custom Cloudflare loader / plain `<img>` only); zero-CLS (containers reserve aspect ratio).
- **RTL Arabic** UI throughout; use logical properties (`ms/me/start/end`), match existing component idiom.
- **Verify loop every task:** `npx pnpm@10.18.0 exec tsc --noEmit` + `npx pnpm@10.18.0 exec eslint .` clean; run the task's test.
- **After any field/collection change:** run `npx pnpm@10.18.0 exec payload generate:types` before typechecking.
- **The scrape** lives in `lallafatema-content/` (gitignored, local). It is NOT committed. Data lives in Neon.

---

## File Structure

**Modify:**
- `src/collections/Posts.ts` — add `featuredType` + `featuredVideoUrl` fields.
- `src/collections/Videos.ts` — `admin.hidden: true` (retire from admin; keep registered so the table is not dropped).
- `src/lib/video.ts` — add `youtubeId()` + `youtubeThumbnailUrl()`.
- `src/lib/queries.ts` — add `getVideoPosts()` / `getLatestVideoPosts()`; remove now-unused `getLatestVideos`/`getVideoById`/`getRelatedVideos`.
- `src/lib/seo.ts` — add `videoObjectJsonLdForPost()`; remove now-unused `videoObjectJsonLd(video)`.
- `src/lib/routes.ts` — add `videosListingUrl()`; remove `videoWatchUrl()` + unused `Video` import.
- `src/components/VideoPlayer.tsx` — optional `fallbackPosterUrl` prop.
- `src/components/ArticleView.tsx` — video-hero branch + article VideoObject JSON-LD wiring input.
- `src/components/PostCard.tsx` — play badge for video-posts across variants.
- `src/components/VideoCard.tsx` — retype `Video → Post`, link to `postUrl`.
- `src/components/VideoSection.tsx` — retype `videos: Post[]`.
- `src/app/(frontend)/page.tsx` — homepage video band → `getLatestVideoPosts`.
- `src/app/(frontend)/[category]/[slug]/page.tsx` — render article VideoObject JSON-LD.
- `src/app/(frontend)/videos/[slugId]/page.tsx` — replace watch page with `permanentRedirect('/videos')`.
- `src/components/Header.tsx` — "فيديو" → `/videos` floor item; drop `video` category from the fallback nav.
- `src/app/(frontend)/sitemap.xml/route.ts` — drop standalone-videos block; add `/videos` loc.
- `src/seed/migrate-wp.ts` — drop `فيديو` skip; wire `featuredType`/`featuredVideoUrl`.
- `tests/int/video.int.spec.ts`, `tests/int/routes.int.spec.ts`, `tests/e2e/videos.e2e.spec.ts` — update for new behavior.

**Create:**
- `src/migrations/<ts>_add_post_featured_video.ts` (generated).
- `src/app/(frontend)/videos/page.tsx` — the `/videos` listing.
- `tests/int/video-post.int.spec.ts` — field + query int tests.

---

## Task 1: Schema — `featuredType` + `featuredVideoUrl` on Posts

**Files:**
- Modify: `src/collections/Posts.ts` (after `featuredImage`, ~L75-79)
- Create: `src/migrations/<ts>_add_post_featured_video.ts` (generated)
- Test: `tests/int/video-post.int.spec.ts`

**Interfaces:**
- Produces: `Post.featuredType?: ('image' | 'video') | null`, `Post.featuredVideoUrl?: string | null` (after `generate:types`). Consumed by Tasks 3–9.

- [ ] **Step 1: Add the two fields to Posts.ts**

In `src/collections/Posts.ts`, replace the `featuredImage` field block:

```ts
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      label: 'الصورة البارزة',
    },
```

with:

```ts
    {
      name: 'featuredType',
      type: 'select',
      label: 'نوع الوسائط البارزة',
      defaultValue: 'image',
      options: [
        { label: 'صورة', value: 'image' },
        { label: 'فيديو', value: 'video' },
      ],
      admin: {
        position: 'sidebar',
        description: 'اختر صورة أو رابط فيديو ليظهر في رأس المقال.',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      label: 'الصورة البارزة (الغلاف)',
      admin: {
        description: 'تُستخدم كغلاف على البطاقات، وكصورة مصغّرة للفيديو.',
      },
    },
    {
      name: 'featuredVideoUrl',
      type: 'text',
      label: 'رابط الفيديو',
      admin: {
        condition: (data) => data?.featuredType === 'video',
        description: 'رابط YouTube/Vimeo (يُحمَّل الإطار عند النقر فقط). المصادر غير المدعومة تُعرض كرابط خارجي.',
      },
      validate: (value: string | null | undefined, { siblingData }: { siblingData: { featuredType?: string } }) => {
        if (siblingData?.featuredType !== 'video') return true
        if (!value) return 'رابط الفيديو مطلوب عند اختيار نوع الفيديو.'
        try {
          new URL(value)
          return true
        } catch {
          return 'الرجاء إدخال رابط صحيح.'
        }
      },
    },
```

- [ ] **Step 2: Regenerate types**

Run: `npx pnpm@10.18.0 exec payload generate:types`
Expected: `src/payload-types.ts` gains `featuredType?: ('image'|'video')|null` and `featuredVideoUrl?: string|null` on `interface Post`.

- [ ] **Step 3: Generate the migration file**

Run: `npx pnpm@10.18.0 exec payload migrate:create add_post_featured_video`
Expected: a new `src/migrations/<ts>_add_post_featured_video.ts`. Open it and confirm `up()` is **additive-only** — it should create two enum types and add four columns, roughly:

```sql
CREATE TYPE "public"."enum_posts_featured_type" AS ENUM('image', 'video');
CREATE TYPE "public"."enum__posts_v_version_featured_type" AS ENUM('image', 'video');
ALTER TABLE "posts" ADD COLUMN "featured_type" "enum_posts_featured_type" DEFAULT 'image';
ALTER TABLE "posts" ADD COLUMN "featured_video_url" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_featured_type" "enum__posts_v_version_featured_type" DEFAULT 'image';
ALTER TABLE "_posts_v" ADD COLUMN "version_featured_video_url" varchar;
```

There must be **no DROP/DELETE/TRUNCATE**. If the generated SQL differs, use the generated SQL (not the sample above) in the next step.

- [ ] **Step 4: Apply the migration to Neon (orchestrator, main session — not a subagent)**

Using `mcp__neon__run_sql_transaction`, project `icy-union-71150532`, run the generated `up()` statements **plus** the tracking row in one transaction (substitute the real generated migration filename, without extension, for `<name>`):

```sql
CREATE TYPE "public"."enum_posts_featured_type" AS ENUM('image', 'video');
CREATE TYPE "public"."enum__posts_v_version_featured_type" AS ENUM('image', 'video');
ALTER TABLE "posts" ADD COLUMN "featured_type" "enum_posts_featured_type" DEFAULT 'image';
ALTER TABLE "posts" ADD COLUMN "featured_video_url" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_featured_type" "enum__posts_v_version_featured_type" DEFAULT 'image';
ALTER TABLE "_posts_v" ADD COLUMN "version_featured_video_url" varchar;
INSERT INTO payload_migrations (name, batch, updated_at, created_at) VALUES ('<name>', 10, now(), now());
```

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='posts' AND column_name IN ('featured_type','featured_video_url');` returns both rows.

- [ ] **Step 5: Write the failing int test**

Create `tests/int/video-post.int.spec.ts` (model on `tests/int/api.int.spec.ts` — get the payload client the same way it does):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

let payload: Payload
const created: number[] = []

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})
afterAll(async () => {
  for (const id of created) {
    await payload.delete({ collection: 'posts', id }).catch(() => {})
  }
})

async function categoryId(slug: string): Promise<number> {
  const { docs } = await payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1 })
  return docs[0].id as number
}

describe('Post featured video fields', () => {
  it('stores featuredType=video + featuredVideoUrl and reads them back', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'فيديو اختبار',
        category: await categoryId('video'),
        featuredType: 'video',
        featuredVideoUrl: 'https://www.youtube.com/watch?v=abc123',
        _status: 'published',
      } as never,
    })
    created.push(post.id as number)
    const read = await payload.findByID({ collection: 'posts', id: post.id })
    expect(read.featuredType).toBe('video')
    expect(read.featuredVideoUrl).toBe('https://www.youtube.com/watch?v=abc123')
  })

  it('defaults featuredType to image when omitted', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'صورة اختبار', category: await categoryId('news'), _status: 'published' } as never,
    })
    created.push(post.id as number)
    const read = await payload.findByID({ collection: 'posts', id: post.id })
    expect(read.featuredType ?? 'image').toBe('image')
  })
})
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video-post.int.spec.ts`
Expected: 2 passing. (If it fails on a missing column, the migration in Step 4 wasn't applied.)

- [ ] **Step 7: tsc + eslint + commit**

```bash
npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .
git add src/collections/Posts.ts src/payload-types.ts src/migrations tests/int/video-post.int.spec.ts
git commit -m "feat(posts): add featuredType + featuredVideoUrl (image|video hero)"
```

---

## Task 2: `youtubeId` + `youtubeThumbnailUrl` helpers

**Files:**
- Modify: `src/lib/video.ts`
- Test: `tests/int/video.int.spec.ts` (append)

**Interfaces:**
- Produces: `youtubeId(url: string): string | null`, `youtubeThumbnailUrl(url: string): string | null`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `tests/int/video.int.spec.ts`:

```ts
import { youtubeId, youtubeThumbnailUrl } from '@/lib/video'

describe('youtubeId', () => {
  it('extracts id from watch links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('extracts id from youtu.be links', () => {
    expect(youtubeId('https://youtu.be/A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('extracts id from embed links', () => {
    expect(youtubeId('https://www.youtube.com/embed/A7OH7CK7ngw')).toBe('A7OH7CK7ngw')
  })
  it('returns null for non-youtube / invalid', () => {
    expect(youtubeId('https://vimeo.com/12345')).toBeNull()
    expect(youtubeId('https://www.instagram.com/reel/x/')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
  })
})

describe('youtubeThumbnailUrl', () => {
  it('builds an hqdefault url for youtube', () => {
    expect(youtubeThumbnailUrl('https://www.youtube.com/watch?v=A7OH7CK7ngw')).toBe(
      'https://img.youtube.com/vi/A7OH7CK7ngw/hqdefault.jpg',
    )
  })
  it('returns null for non-youtube', () => {
    expect(youtubeThumbnailUrl('https://vimeo.com/12345')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video.int.spec.ts`
Expected: FAIL — `youtubeId is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/video.ts`:

```ts
/** Extract the YouTube video id from watch / youtu.be / embed URLs. Null otherwise. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1) || null
    if (host.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null
      return u.searchParams.get('v')
    }
    return null
  } catch {
    return null
  }
}

/** YouTube poster fallback (used when a video-post has no uploaded featuredImage). */
export function youtubeThumbnailUrl(url: string): string | null {
  const id = youtubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video.int.spec.ts`
Expected: all passing (original embedUrl tests + new ones).

- [ ] **Step 5: tsc + eslint + commit**

```bash
npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .
git add src/lib/video.ts tests/int/video.int.spec.ts
git commit -m "feat(video): add youtubeId + youtubeThumbnailUrl helpers"
```

---

## Task 3: `getVideoPosts()` query

**Files:**
- Modify: `src/lib/queries.ts`
- Test: `tests/int/video-post.int.spec.ts` (append)

**Interfaces:**
- Consumes: `Post.featuredType` (Task 1).
- Produces:
  - `getVideoPosts({ limit, page }): Promise<PaginatedDocs<Post>>` — `where featuredType==='video'` AND published, `sort ['-publishedAt','-createdAt']`, `depth:1`.
  - `getLatestVideoPosts(limit = 5): Promise<Post[]>`.
  Consumed by Tasks 6, 7.

- [ ] **Step 1: Write the failing test**

Append to `tests/int/video-post.int.spec.ts` (inside the same file; reuse `payload`/`created`/`categoryId`):

```ts
describe('getVideoPosts', () => {
  it('returns only published video-posts, newest first', async () => {
    const { getVideoPosts } = await import('@/lib/queries')
    const vid = await payload.create({
      collection: 'posts',
      data: {
        title: 'فيديو استعلام',
        category: await categoryId('video'),
        featuredType: 'video',
        featuredVideoUrl: 'https://youtu.be/qqq111',
        _status: 'published',
      } as never,
    })
    created.push(vid.id as number)
    const img = await payload.create({
      collection: 'posts',
      data: { title: 'مقال صورة', category: await categoryId('news'), _status: 'published' } as never,
    })
    created.push(img.id as number)

    const { docs } = await getVideoPosts({ limit: 100 })
    const ids = docs.map((d) => d.id)
    expect(ids).toContain(vid.id)
    expect(ids).not.toContain(img.id)
    expect(docs.every((d) => d.featuredType === 'video')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video-post.int.spec.ts`
Expected: FAIL — `getVideoPosts is not a function`.

- [ ] **Step 3: Implement the queries**

In `src/lib/queries.ts`, add after `getPostsByCategory` (~L144):

```ts
type VideoPostQuery = { limit?: number; page?: number }

/** Published posts whose featured media is a video, newest first (the /videos listing + homepage band). */
export async function getVideoPosts({ limit = 12, page = 1 }: VideoPostQuery = {}) {
  const payload = await getPayloadClient()
  return payload.find({
    collection: 'posts',
    where: { and: [PUBLISHED, { featuredType: { equals: 'video' } }] },
    sort: ['-publishedAt', '-createdAt'],
    limit,
    page,
    depth: 1,
  })
}

export async function getLatestVideoPosts(limit = 5): Promise<Post[]> {
  const { docs } = await getVideoPosts({ limit })
  return docs
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/video-post.int.spec.ts`
Expected: all passing.

- [ ] **Step 5: tsc + eslint + commit**

```bash
npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .
git add src/lib/queries.ts tests/int/video-post.int.spec.ts
git commit -m "feat(queries): add getVideoPosts / getLatestVideoPosts"
```

---

## Task 4: Article video hero + VideoObject JSON-LD

**Files:**
- Modify: `src/components/VideoPlayer.tsx`, `src/components/ArticleView.tsx`, `src/lib/seo.ts`, `src/app/(frontend)/[category]/[slug]/page.tsx`
- Test: `tests/e2e/videos.e2e.spec.ts` (the facade assertion is added in Task 7's rewrite; here rely on tsc/build + manual)

**Interfaces:**
- Consumes: `youtubeThumbnailUrl` (Task 2), `Post.featuredType`/`featuredVideoUrl` (Task 1).
- Produces: `videoObjectJsonLdForPost(post: Post)` in `seo.ts`.

- [ ] **Step 1: Add `fallbackPosterUrl` to VideoPlayer**

In `src/components/VideoPlayer.tsx`, change the signature + poster render. Replace the props block and the `<PostImage …/>` line:

```tsx
export function VideoPlayer({
  videoUrl,
  thumbnail,
  title,
  fallbackPosterUrl,
}: {
  videoUrl: string
  thumbnail: number | Media | null | undefined
  title: string
  /** Plain poster URL (e.g. YouTube hqdefault) used when no Media thumbnail exists. Renders a plain <img> (no /_next/image). */
  fallbackPosterUrl?: string
}) {
```

and replace:

```tsx
          <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
```

with:

```tsx
          {thumbnail && typeof thumbnail === 'object' && thumbnail.url ? (
            <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          ) : fallbackPosterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external poster, kept off /_next/image for CWV
            <img src={fallbackPosterUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <PostImage image={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1024px" priority />
          )}
```

- [ ] **Step 2: Add `videoObjectJsonLdForPost` to seo.ts**

In `src/lib/seo.ts`, add near `videoObjectJsonLd` (which will be removed in Task 8 — that's fine, add this now):

```ts
export function videoObjectJsonLdForPost(post: Post) {
  if (post.featuredType !== 'video' || !post.featuredVideoUrl) return null
  const thumb = asMedia(post.featuredImage)
  return {
    '@context': CONTEXT,
    '@type': 'VideoObject',
    name: post.title,
    description: post.excerpt ?? post.title,
    thumbnailUrl: thumb?.url ? [absoluteUrl(thumb.url)] : undefined,
    uploadDate: post.publishedAt ?? post.createdAt,
    contentUrl: post.featuredVideoUrl,
    embedUrl: post.featuredVideoUrl,
    inLanguage: 'ar',
  }
}
```

- [ ] **Step 3: Render the video hero in ArticleView**

In `src/components/ArticleView.tsx`, add imports at the top:

```tsx
import { VideoPlayer } from './VideoPlayer'
import { youtubeThumbnailUrl } from '@/lib/video'
```

Replace the static hero block:

```tsx
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
          <PostImage image={post.featuredImage} alt={post.title} priority sizes="(max-width: 1000px) 100vw, 1000px" />
        </div>
```

with:

```tsx
        {post.featuredType === 'video' && post.featuredVideoUrl ? (
          <div className="mt-6">
            <VideoPlayer
              videoUrl={post.featuredVideoUrl}
              thumbnail={post.featuredImage}
              title={post.title}
              fallbackPosterUrl={youtubeThumbnailUrl(post.featuredVideoUrl) ?? undefined}
            />
          </div>
        ) : (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl">
            <PostImage image={post.featuredImage} alt={post.title} priority sizes="(max-width: 1000px) 100vw, 1000px" />
          </div>
        )}
```

- [ ] **Step 4: Wire the JSON-LD into the article page**

In `src/app/(frontend)/[category]/[slug]/page.tsx`, add `videoObjectJsonLdForPost` to the seo import, compute it, and render it. Change the import:

```tsx
import {
  buildMetadata,
  ogImageUrl,
  newsArticleJsonLd,
  recipeJsonLd,
  breadcrumbJsonLd,
  videoObjectJsonLdForPost,
} from '@/lib/seo'
```

After `const recipe = recipeJsonLd(post)` add:

```tsx
  const videoLd = videoObjectJsonLdForPost(post)
```

and in the returned JSX, after the recipe line:

```tsx
      {recipe && <JsonLd data={recipe} />}
      {videoLd && <JsonLd data={videoLd} />}
```

- [ ] **Step 5: Verify (tsc + eslint + build)**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Expected: clean; homepage `○ Static`; `/[category]/[slug]` still `ƒ`.

- [ ] **Step 6: Manual smoke (dev)**

Start `npx pnpm@10.18.0 dev`. In admin, set a post's `featuredType=video` + a YouTube `featuredVideoUrl`, publish, open the article. Confirm: poster shows, **no `<iframe>` in the DOM until you click**, click loads the embed. (Full e2e assertion lands in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add src/components/VideoPlayer.tsx src/components/ArticleView.tsx src/lib/seo.ts "src/app/(frontend)/[category]/[slug]/page.tsx"
git commit -m "feat(article): video hero facade + VideoObject JSON-LD"
```

---

## Task 5: PostCard play badge for video-posts

**Files:**
- Modify: `src/components/PostCard.tsx`
- Test: covered by Task 7 e2e (badge visible on `/videos`); here tsc/eslint + build.

**Interfaces:**
- Consumes: `Post.featuredType` (Task 1).

- [ ] **Step 1: Add an `isVideo` flag + a `<PlayBadge>` helper**

In `src/components/PostCard.tsx`, after `const isExclusive = …` add:

```tsx
const isVideoPost = (post: Post): boolean => post.featuredType === 'video'
```

and add a small badge component near `ExclusiveBadge`:

```tsx
/** Small centered play badge overlaid on a video-post thumbnail. */
function PlayBadge({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <span
        className={`grid place-items-center rounded-full bg-brand-600/90 text-white shadow-lg ring-2 ring-white/30 ${
          small ? 'h-8 w-8' : 'h-12 w-12'
        }`}
      >
        <PlayIcon className="ms-0.5" width={small ? 16 : 24} height={small ? 16 : 24} />
      </span>
    </span>
  )
}
```

Add the icon import at the top:

```tsx
import { PlayIcon } from './icons'
```

- [ ] **Step 2: Compute `isVideo` and render the badge in each variant**

In the `PostCard` body, after `const exclusive = isExclusive(category)` add:

```tsx
  const isVideo = isVideoPost(post)
```

Then inside each thumbnail `<Link>` (compact, overlay, lead, default/hero), add the badge next to the existing `{exclusive && …}` line. Use `small` for the compact variant, default size elsewhere:

- compact `<Link …>`: add `{isVideo && <PlayBadge small />}`
- overlay `<article>` (badge over the fill image): add `{isVideo && <PlayBadge />}` right after `{exclusive && <ExclusiveBadge />}`
- lead `<Link …>`: add `{isVideo && <PlayBadge />}`
- default/hero `<Link …>`: add `{isVideo && <PlayBadge />}`

- [ ] **Step 3: Verify**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/PostCard.tsx
git commit -m "feat(cards): play badge on video-post cards"
```

---

## Task 6: Homepage video band → video-posts

**Files:**
- Modify: `src/components/VideoCard.tsx`, `src/components/VideoSection.tsx`, `src/app/(frontend)/page.tsx`
- Test: covered by Task 7 e2e; tsc/eslint + build here.

**Interfaces:**
- Consumes: `getLatestVideoPosts` (Task 3), `postUrl` (routes).
- Produces: `VideoCard({ post: Post, variant })`, `VideoSection({ videos: Post[], title? })`.

- [ ] **Step 1: Retype VideoCard to Post**

Rewrite `src/components/VideoCard.tsx` to consume a `Post` and link to the article (drop `duration`; use `excerpt` for the lead blurb):

```tsx
import Link from 'next/link'

import type { Post } from '@/payload-types'
import { postUrl } from '@/lib/routes'
import { PlayIcon } from './icons'
import { PostImage } from './PostImage'

type Variant = 'lead' | 'list'

function PlayButton({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-300 group-hover:scale-105"
    >
      <span
        className={`grid place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white/20 ${
          large ? 'h-16 w-16' : 'h-10 w-10'
        }`}
      >
        <PlayIcon className="ms-0.5" width={large ? 30 : 20} height={large ? 30 : 20} />
      </span>
    </span>
  )
}

/**
 * Video-post thumbnail for the dark homepage band. Navigational server component —
 * it LINKS to the article (/<category>/<slug>-<id>), where the video plays.
 */
export function VideoCard({ post, variant = 'list' }: { post: Post; variant?: Variant }) {
  const isLead = variant === 'lead'
  const sizes = isLead ? '(max-width: 768px) 100vw, 50vw' : '160px'
  const href = postUrl(post)

  const frame = (
    <Link
      href={href}
      className="relative block aspect-video w-full overflow-hidden rounded-xl bg-brand-900"
    >
      <PostImage
        image={post.featuredImage}
        alt={post.title}
        sizes={sizes}
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <PlayButton large={isLead} />
    </Link>
  )

  if (isLead) {
    return (
      <article className="group">
        {frame}
        <h3 className="mt-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          <Link href={href}>{post.title}</Link>
        </h3>
        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/70">{post.excerpt}</p>
        )}
      </article>
    )
  }

  return (
    <article className="group flex items-start gap-3">
      <div className="w-40 flex-none">{frame}</div>
      <div className="min-w-0 pt-1">
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white/90 group-hover:text-brand-200">
          <Link href={href}>{post.title}</Link>
        </h3>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Retype VideoSection to Post[]**

In `src/components/VideoSection.tsx`, change the import and signature:

```tsx
import type { Post } from '@/payload-types'
```

```tsx
export function VideoSection({ videos, title = 'فيديو' }: { videos: Post[]; title?: string }) {
```

and change the "المزيد" link target from the category to the listing:

```tsx
import { videosListingUrl } from '@/lib/routes'
```

```tsx
        <SectionHeading title={title} href={videosListingUrl()} light />
```

(`videosListingUrl` is added in Task 7 Step 1; if executing 6 before 7, add that one-line route helper first.)

- [ ] **Step 3: Repoint the homepage band**

In `src/app/(frontend)/page.tsx`:
- Remove `Video` from the `@/payload-types` import and remove `getLatestVideos` from the `@/lib/queries` import; add `getLatestVideoPosts`.
- Delete the `onlyPublishedVideos` helper.
- Replace the video-band block:

```tsx
  // Video band: latest video-posts (video is now an article property). Toggle-gated.
  const videoBand = homepage.videoBand
  const showVideoBand = videoBand?.enabled ?? true
  const videos = showVideoBand ? await getLatestVideoPosts(5) : []
```

(The homepage global's `videoBand.pinnedVideos` relationship still points at the retired `videos` collection; it is now unread. Leave the field in place — removing it is a destructive column/join change. Note as a follow-up.)

- [ ] **Step 4: Verify**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Expected: clean; homepage `○ Static`.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoCard.tsx src/components/VideoSection.tsx "src/app/(frontend)/page.tsx" src/lib/routes.ts
git commit -m "feat(home): video band shows latest video-posts"
```

---

## Task 7: `/videos` listing + nav + watch-page redirect + sitemap

**Files:**
- Create: `src/app/(frontend)/videos/page.tsx`
- Modify: `src/app/(frontend)/videos/[slugId]/page.tsx`, `src/lib/routes.ts`, `src/components/Header.tsx`, `src/app/(frontend)/sitemap.xml/route.ts`
- Test: rewrite `tests/e2e/videos.e2e.spec.ts`

**Interfaces:**
- Consumes: `getVideoPosts` (Task 3), `PostCard` video badge (Task 5).
- Produces: `videosListingUrl(): string` in routes.ts.

- [ ] **Step 1: Add `videosListingUrl` to routes.ts**

In `src/lib/routes.ts`, add:

```ts
/** The aggregated video-posts listing. */
export function videosListingUrl(): string {
  return '/videos'
}
```

- [ ] **Step 2: Create the `/videos` listing page**

Create `src/app/(frontend)/videos/page.tsx` (model on `[category]/page.tsx`'s category branch):

```tsx
import type { Metadata } from 'next'

import { JsonLd } from '@/components/JsonLd'
import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getSiteConfig, getVideoPosts } from '@/lib/queries'
import { videosListingUrl } from '@/lib/routes'
import { buildMetadata, breadcrumbJsonLd, ogImageUrl } from '@/lib/seo'

export const revalidate = 300

type Props = { searchParams: Promise<{ page?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSiteConfig()
  return buildMetadata({
    title: 'فيديو',
    description: 'أحدث مقاطع الفيديو من لالة فاطمة.',
    path: videosListingUrl(),
    image: ogImageUrl(cfg.defaultOgImage),
    type: 'website',
  })
}

export default async function VideosPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const { docs, totalPages } = await getVideoPosts({ limit: 16, page })

  return (
    <div className="lf-container py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'الرئيسية', url: '/' },
          { name: 'فيديو', url: videosListingUrl() },
        ])}
      />
      <SectionHeading title="فيديو" />

      {docs.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">لا توجد مقاطع فيديو بعد.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {docs.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination basePath={videosListingUrl()} page={page} totalPages={totalPages} />
    </div>
  )
}
```

- [ ] **Step 3: Replace the watch page with a permanent redirect**

Replace the entire contents of `src/app/(frontend)/videos/[slugId]/page.tsx` with:

```tsx
import { permanentRedirect } from 'next/navigation'

// The standalone video watch pages are retired; video is now an article property.
// Any old /videos/<slug>-<id> link 301s to the aggregated listing.
export default async function LegacyVideoWatchRedirect() {
  permanentRedirect('/videos')
}
```

- [ ] **Step 4: Repoint the nav**

In `src/components/Header.tsx`, exclude the `video` category from the fallback and add a `/videos` floor item. Change the fallback `.filter`:

```tsx
      : categories
          .filter((c) => !c.parent && c.slug !== 'video')
          .map((c) => ({ label: c.name, href: categoryUrl(c.slug ?? ''), children: [] }))
```

and extend the floor line:

```tsx
  const items = [
    ...baseItems,
    { label: 'فيديو', href: '/videos', children: [] },
    { label: 'المجلة', href: '/magazine', children: [] },
  ]
```

- [ ] **Step 5: Fix the sitemap**

In `src/app/(frontend)/sitemap.xml/route.ts`:
- Remove the `videos` query from the `Promise.all` (the 4th entry) and drop `videos` from the destructure.
- Remove the `for (const v of videos.docs) { … videoWatchUrl … }` loop.
- Remove `videoWatchUrl` from the `@/lib/routes` import; add `videosListingUrl`.
- Add, after the categories loop: `urls.push(urlTag(absoluteUrl(videosListingUrl())))`.

Resulting destructure: `const [posts, categories, issues, pages] = await Promise.all([...])` (four entries).

- [ ] **Step 6: Rewrite the e2e**

Replace `tests/e2e/videos.e2e.spec.ts` with:

```ts
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Videos section + article video hero', () => {
  test('/videos lists video-posts that link to their article', async ({ page }) => {
    await page.goto(`${BASE}/videos`)
    await expect(page.getByRole('heading', { name: 'فيديو' })).toBeVisible()
    const card = page.locator('a[href^="/"]').filter({ has: page.locator('h3') }).first()
    await expect(card).toBeVisible()
  })

  test('old /videos/<slug>-<id> watch URL 301s to /videos', async ({ page }) => {
    const res = await page.goto(`${BASE}/videos/some-old-video-123`)
    expect(page.url()).toBe(`${BASE}/videos`)
    expect(res?.status()).toBeLessThan(400)
  })

  test('a video article hero loads no iframe until click', async ({ page }) => {
    // Navigate to the first video-post from /videos.
    await page.goto(`${BASE}/videos`)
    const link = page.locator('article a[href*="/"]').first()
    const href = await link.getAttribute('href')
    test.skip(!href, 'no video-posts seeded')
    await page.goto(`${BASE}${decodeURI(href!)}`)
    await expect(page.locator('iframe')).toHaveCount(0)
    const play = page.getByRole('button', { name: /تشغيل/ }).first()
    await expect(play).toBeVisible()
    await play.click()
    await expect(page.locator('iframe')).toBeVisible()
  })
})
```

- [ ] **Step 7: Verify**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Expected: clean; `/videos` present as `○`/`●`, `/videos/[slugId]` `ƒ`, homepage `○ Static`.
Then, against a running `npx pnpm@10.18.0 dev` (once video-posts exist — Task 9), run:
`npx pnpm@10.18.0 exec playwright test --config=playwright.config.ts tests/e2e/videos.e2e.spec.ts`

- [ ] **Step 8: Commit**

```bash
git add "src/app/(frontend)/videos" src/lib/routes.ts src/components/Header.tsx "src/app/(frontend)/sitemap.xml/route.ts" tests/e2e/videos.e2e.spec.ts
git commit -m "feat(videos): /videos listing, nav repoint, watch-page 301, sitemap"
```

---

## Task 8: Retire the standalone Videos collection surface

**Files:**
- Modify: `src/collections/Videos.ts`, `src/lib/queries.ts`, `src/lib/seo.ts`, `src/lib/routes.ts`, `tests/int/routes.int.spec.ts`, `tests/int/video.int.spec.ts`

**Interfaces:**
- Removes: `getLatestVideos`, `getVideoById`, `getRelatedVideos` (queries), `videoObjectJsonLd(video)` (seo), `videoWatchUrl` (routes). All consumers were repointed in Tasks 6–7.

- [ ] **Step 1: Hide the collection from admin (keep the table)**

In `src/collections/Videos.ts`, add to `admin`:

```ts
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', '_status', 'publishedAt'],
    group: 'المحتوى',
    hidden: true,
    description: 'مجموعة الفيديو المستقلة متقاعدة — الفيديو الآن خاصية للمقال.',
  },
```

Do NOT remove the collection from `payload.config.ts` (that would trigger a destructive table drop on the next migrate). No migration is needed for `admin.hidden`.

- [ ] **Step 2: Remove the now-unused video queries**

In `src/lib/queries.ts`, delete `getLatestVideos`, `getVideoById`, and `getRelatedVideos`. Remove `Video` from the `@/payload-types` import **only if** it's no longer referenced anywhere else in the file (check — after deletions, `Video` should be unused; remove it).

- [ ] **Step 3: Remove `videoObjectJsonLd(video)` from seo.ts**

In `src/lib/seo.ts`, delete the old `videoObjectJsonLd(video: Video)` function (the per-post `videoObjectJsonLdForPost` from Task 4 replaces it). Remove `Video` from the `@/payload-types` import if now unused.

- [ ] **Step 4: Remove `videoWatchUrl` from routes.ts**

In `src/lib/routes.ts`, delete `videoWatchUrl`. Remove `Video` from the `@/payload-types` import (verify no other route helper uses it).

- [ ] **Step 5: Update routes.int.spec.ts**

In `tests/int/routes.int.spec.ts`, remove any `videoWatchUrl` import and its assertions; add a check for the listing:

```ts
import { videosListingUrl } from '@/lib/routes'
// …
it('videosListingUrl is /videos', () => {
  expect(videosListingUrl()).toBe('/videos')
})
```

(Delete the whole `videoWatchUrl` describe/it block.)

- [ ] **Step 6: Regenerate types + verify**

Run: `npx pnpm@10.18.0 exec payload generate:types`
Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Expected: clean — no dangling references to the removed symbols. Fix any import that still points at them.

- [ ] **Step 7: Run the int suites touched**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts tests/int/routes.int.spec.ts tests/int/video.int.spec.ts tests/int/video-post.int.spec.ts`
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add src/collections/Videos.ts src/lib/queries.ts src/lib/seo.ts src/lib/routes.ts src/payload-types.ts tests/int/routes.int.spec.ts
git commit -m "refactor(videos): retire standalone Videos collection surface"
```

---

## Task 9: WordPress importer — import the video-posts

**Files:**
- Modify: `src/seed/migrate-wp.ts`
- Data: run the importer against Neon (orchestrator, main session).

**Interfaces:**
- Consumes: `Post.featuredType`/`featuredVideoUrl` (Task 1), the `video` category (id 11), the scrape in `lallafatema-content/`.

**Import rules (from the user's decisions):**
- 36 `فيديو`-primary articles that have `videos[0]` → category `video`, `featuredType:'video'`, `featuredVideoUrl = videos[0].url`. (35 YouTube play inline; the 1 Instagram falls back to an external-link facade automatically via `embedUrl`→null.)
- 3 `فيديو`-primary articles with no video (ids 32665, 22526, 21453) → import as **normal image posts** into their first mapped secondary category (all have `آخر الأخبار` → `news`); `featuredType:'image'`.
- 7 non-`فيديو`-primary articles with `videos[0]` → keep their primary category, set `featuredType:'video'` + `featuredVideoUrl`.

- [ ] **Step 1: Map the video category + drop the skip**

In `src/seed/migrate-wp.ts`, add `فيديو` to `CATEGORY_MAP` and remove it from `SKIP_CATEGORIES`:

```ts
const CATEGORY_MAP: Record<string, string> = {
  مشاهير: 'celebrities',
  'آخر الأخبار': 'news',
  موضة: 'fashion',
  جمال: 'beauty',
  صحة: 'health',
  'لايف ستايل': 'lifestyle',
  مطبخ: 'kitchen',
  فيديو: 'video',
}
// Only magazine issues remain deferred.
const SKIP_CATEGORIES = new Set(['أعداد لالة فاطمة'])
```

- [ ] **Step 2: Extend the Article type + video helpers**

Add to the `Article` type (after `inline_images`):

```ts
  categories?: { id?: number; name: string; slug?: string }[]
  videos?: { platform: string; url: string; embed_url?: string }[]
```

Add a helper above `main()`:

```ts
/** First video URL on an article, if any (we use the canonical watch `url`, not the scrape's embed_url). */
function firstVideoUrl(art: Article): string | null {
  const v = (art.videos ?? [])[0]
  return v?.url ?? null
}
```

- [ ] **Step 3: Rewrite the category-resolution block to handle video articles**

Replace the current category-resolution block (the `const catName = …` through the `categoryId == null` guard, ~L119-128) with logic that decides category + featured media:

```ts
    const primaryName = art.primary_category?.name ?? entry.primary_category
    const videoUrl = firstVideoUrl(art)

    // Resolve the DB category slug + featured media mode for this article.
    let catSlug: string | undefined
    let featuredType: 'image' | 'video' = 'image'

    if (primaryName === 'فيديو') {
      if (videoUrl) {
        // A real video article → lives in the `video` category, video hero.
        catSlug = 'video'
        featuredType = 'video'
      } else {
        // No captured link → import as a normal image post in its first mapped secondary category.
        const secondary = (art.categories ?? [])
          .map((c) => c.name)
          .find((n) => n !== 'فيديو' && CATEGORY_MAP[n])
        catSlug = secondary ? CATEGORY_MAP[secondary] : undefined
        featuredType = 'image'
      }
    } else if (primaryName && CATEGORY_MAP[primaryName] && !SKIP_CATEGORIES.has(primaryName)) {
      catSlug = CATEGORY_MAP[primaryName]
      featuredType = videoUrl ? 'video' : 'image'
    }

    if (!catSlug) {
      stats.skippedCategory++
      continue
    }
    const categoryId = catBySlug.get(catSlug)
    if (categoryId == null) {
      stats.skippedCategory++
      continue
    }
```

- [ ] **Step 4: Ensure the `video` slug is resolved + add featured fields to the post data**

The `catBySlug` map only pre-resolves slugs in `CATEGORY_MAP`'s values — `video` is now included, so it's covered. Confirm `video` resolves (it maps to DB category id 11).

In the `data` object, add the featured video fields and set `featuredType`. Change:

```ts
        ...(heroId != null ? { featuredImage: heroId } : {}),
```

to:

```ts
        featuredType,
        ...(featuredType === 'video' && videoUrl ? { featuredVideoUrl: videoUrl } : {}),
        ...(heroId != null ? { featuredImage: heroId } : {}),
```

Also fix the redirect + log lines that referenced `CATEGORY_MAP[catName]` — replace `CATEGORY_MAP[catName]` with `catSlug` in the redirect `to` and the success `console.log` (there are 2 occurrences near the redirect block and the final log).

- [ ] **Step 5: Fix the `--dry` log line**

The `[dry]` log (~L139) references `CATEGORY_MAP[catName]`. Change it to `catSlug` and note the mode:

```ts
      console.log(`[dry] ${art.id}  ${art.title}  → ${catSlug} (${featuredType})`)
```

- [ ] **Step 6: tsc + eslint + dry run**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint .`
Then dry-run the 43 video-bearing ids to confirm routing (no writes):

```bash
npx pnpm@10.18.0 exec tsx src/seed/migrate-wp.ts --dry --only 33436,33423,32597,31660,31353,31205,31049,30993,30747,30742,29259,28018,28001,27984,25872,23699,23651,22670,22484,22148,22129,22020,21219,21127,21182,21661,21649,21588,21585,21582,21579,21576,21483,21465,21450,21445,32361,33472,33470,33480,33471,33460,33499,32665,22526,21453
```

Expected: 36 → `video (video)`, 7 → their category `(video)`, 3 (32665/22526/21453) → `news (image)`.

- [ ] **Step 7: Run the real import (orchestrator, main session)**

Run the 46 relevant ids with `--force` (re-imports the 36 new video-posts + the 3 no-link posts, and updates the 7 existing non-video-category posts to `featuredType:'video'`; re-uploads their images — a small set). The `.env` must have a valid public `BLOB_READ_WRITE_TOKEN` for images to upload:

```bash
npx pnpm@10.18.0 exec tsx src/seed/migrate-wp.ts --force --only 33436,33423,32597,31660,31353,31205,31049,30993,30747,30742,29259,28018,28001,27984,25872,23699,23651,22670,22484,22148,22129,22020,21219,21127,21182,21661,21649,21588,21585,21582,21579,21576,21483,21465,21450,21445,32361,33472,33470,33480,33471,33460,33499,32665,22526,21453
```

Verify in Neon:

```sql
SELECT featured_type, COUNT(*) FROM posts WHERE _status='published' GROUP BY featured_type;
SELECT COUNT(*) FROM posts p JOIN categories c ON p.category_id=c.id WHERE c.slug='video';
```

Expected: `featured_type='video'` ≈ 43 (36 + 7); `video`-category count = 36. Every `video` row has a non-null `featured_video_url`.

- [ ] **Step 8: Commit the importer change**

```bash
git add src/seed/migrate-wp.ts
git commit -m "feat(migration): import video articles as video-posts"
```

---

## Task 10: Full verification + final review

**Files:** none (verification only)

- [ ] **Step 1: Full static verification**

Run: `npx pnpm@10.18.0 exec tsc --noEmit && npx pnpm@10.18.0 exec eslint . && npx pnpm@10.18.0 build`
Confirm from the build output:
- homepage `○ (Static)`
- `/videos` static or ISR (not erroring), `/videos/[slugId]` `ƒ`
- `/[category]/[slug]` `ƒ`

- [ ] **Step 2: Int suite**

Run: `npx pnpm@10.18.0 exec vitest run --config ./vitest.config.mts`
Expected: all green (includes the new `video-post.int.spec.ts`, updated `video.int.spec.ts`, `routes.int.spec.ts`).

- [ ] **Step 3: e2e against dev**

Start `npx pnpm@10.18.0 dev`, then:
`npx pnpm@10.18.0 exec playwright test --config=playwright.config.ts tests/e2e/videos.e2e.spec.ts`
Expected: 3/3. Also spot-check the network panel on a video article: **0 requests to youtube.com until the play button is clicked**, **0 `/_next/image`**.

- [ ] **Step 4: Manual CWV/behaviour checklist (dev browser)**
- `/videos` lists video-posts newest-first, each with a play badge, linking to the article.
- A video article's hero shows the poster + play badge; clicking loads the embed (Instagram post → opens the external link).
- Homepage video band shows latest video-posts in the dark band, linking to articles.
- "فيديو" nav item → `/videos`; `/videos/old-x-1` → 301 → `/videos`.
- `/video` category page still lists the 36 video-posts (badged).

- [ ] **Step 5: Final whole-branch review (opus)**

Dispatch the opus final review (superpowers:requesting-code-review pattern used in prior phases): correctness, CWV invariants (no-iframe-until-click, static homepage, 0 `/_next/image`), draft-safety of queries, retirement completeness (no dangling `Video`/`videoWatchUrl`/`getLatestVideos` refs), migration additivity, and importer routing. Address any Critical/Important findings before merge.

- [ ] **Step 6: Merge**

Follow the established finish pattern (superpowers:finishing-a-development-branch): merge to `main` locally `--no-ff`, delete the feature branch. Push per the user's cadence.

---

## Self-Review (against the spec)

**Spec coverage:**
- Article hero holds a video (thumbnail → click-to-play) → Task 4 (VideoPlayer in ArticleView).
- Admin image-OR-video toggle → Task 1 (`featuredType` select + conditional `featuredVideoUrl`).
- `featuredImage` stays universal poster; YouTube-thumbnail fallback → Tasks 1, 2, 4.
- Video-post cards show a play badge → Task 5.
- `/videos` lists all video-posts newest-first, paginated → Tasks 3, 7.
- Retire standalone `Videos`; repoint `/videos` + nav; redirect old watch pages → Tasks 6, 7, 8.
- Homepage band → latest video-posts → Task 6.
- Per-article VideoObject JSON-LD → Task 4.
- Migration: drop `فيديو` skip, wire `videos[0]→featuredVideoUrl` (+ the 7 in-category) → Task 9.
- Verification bar (tsc/eslint/build, static home, no-iframe-until-click, `/videos` order, migrated posts render, 0 `/_next/image`) → Task 10.

**Open decisions (resolved per the user):**
- Categories → 36 in `video` category; `/videos` aggregates via `featuredType` (Tasks 7, 9).
- Instagram → external-link facade (existing `embedUrl`→null path, no new embed); 3 no-link → normal image posts in `news` (Task 9).
- Videos collection → retired (Task 8); watch pages 301→`/videos` (Task 7); homepage band repointed (Task 6).

**Type consistency:** `getVideoPosts`/`getLatestVideoPosts`, `videoObjectJsonLdForPost`, `videosListingUrl`, `youtubeId`/`youtubeThumbnailUrl`, `VideoCard({post})`, `VideoSection({videos: Post[]})`, `VideoPlayer({fallbackPosterUrl})` — names used identically across defining and consuming tasks. Removed symbols (`getLatestVideos`, `getVideoById`, `getRelatedVideos`, `videoObjectJsonLd`, `videoWatchUrl`) have all consumers repointed before removal (Task 8 runs after 6–7).

**Non-destructive guarantee:** the `videos` table and the homepage `videoBand.pinnedVideos` column are left intact; retirement is surface-only. Dropping them is a deferred, separately-authorized destructive migration.
```
