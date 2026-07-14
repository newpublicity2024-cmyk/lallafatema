/**
 * WordPress → Payload content migration.
 *
 * Reads the self-contained scrape in `lallafatema-content/` (index.json + per-article
 * JSON + downloaded images) and creates published Posts with their images, categories,
 * author, SEO, and 301 redirects. Idempotent via `legacyWpId` (re-runs skip existing
 * posts unless --force). Images upload through Payload's configured storage adapter
 * (Vercel Blob when BLOB_READ_WRITE_TOKEN is set; local disk otherwise).
 *
 * Usage:
 *   tsx src/seed/migrate-wp.ts [--limit N] [--only 123,456] [--dry] [--force]
 *
 * Deferred (skipped) by design: primary category "فيديو" (video) and
 * "أعداد لالة فاطمة" (magazine issues) — see the migration notes.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'

import config from '../payload.config'
import { htmlToLexical, type ResolveImage } from './wp/htmlToLexical'

const CONTENT_ROOT = path.resolve(process.cwd(), 'lallafatema-content')

// Scraped Arabic category name → DB category slug. Names not listed here are skipped.
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

const AUTHOR_NAME = 'لالة فاطمة'
const AUTHOR_EMAIL = 'editorial@lallafatema.ma'

type Img = { original_url: string; local_path: string; alt?: string } | null
type Article = {
  id: number
  source_url: string
  slug: string
  title: string
  date: string
  excerpt?: string
  primary_category?: { id: number; name: string; slug: string }
  seo?: { title?: string; description?: string; canonical?: string; og_image?: string }
  content_html?: string
  content_text?: string
  hero_image?: Img
  inline_images?: NonNullable<Img>[]
  categories?: { id?: number; name: string; slug?: string }[]
  videos?: { platform: string; url: string; embed_url?: string }[]
}

/** First video URL on an article, if any (we use the canonical watch `url`, not the scrape's embed_url). */
function firstVideoUrl(art: Article): string | null {
  const v = (art.videos ?? [])[0]
  return v?.url ?? null
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    limit: get('--limit') ? Number(get('--limit')) : Infinity,
    only: get('--only')?.split(',').map((s) => Number(s.trim())) ?? null,
    dry: args.includes('--dry'),
    force: args.includes('--force'),
    // Skip ALL image upload — import text-only posts now, backfill images later
    // (re-run with a blob token + --force). Nothing is written to storage/local disk.
    noImages: args.includes('--no-images'),
  }
}

async function main() {
  const { limit, only, dry, force, noImages } = parseArgs()
  if (noImages) console.log('ℹ --no-images: importing text only; images deferred (backfill later with a blob token + --force)')
  const payload = await getPayload({ config: await config })

  const idx = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'index.json'), 'utf8')) as {
    articles: { id: number; file: string; primary_category: string }[]
  }

  // Resolve DB category ids by slug (once).
  const catBySlug = new Map<string, number | string>()
  for (const slug of new Set(Object.values(CATEGORY_MAP))) {
    const { docs } = await payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    if (docs[0]) catBySlug.set(slug, docs[0].id)
    else console.warn(`⚠ category slug "${slug}" not found in DB — its articles will be skipped`)
  }

  // Find or create the house author.
  let authorId: number | string
  const existingAuthor = await payload.find({ collection: 'users', where: { email: { equals: AUTHOR_EMAIL } }, limit: 1, depth: 0 })
  if (existingAuthor.docs[0]) {
    authorId = existingAuthor.docs[0].id
  } else if (dry) {
    authorId = 0
    console.log(`[dry] would create author "${AUTHOR_NAME}" <${AUTHOR_EMAIL}>`)
  } else {
    const pw = `Lf!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    const created = await payload.create({
      collection: 'users',
      data: { name: AUTHOR_NAME, email: AUTHOR_EMAIL, password: pw, role: 'editor' } as never,
    })
    authorId = created.id
    console.log(`✓ created author "${AUTHOR_NAME}" <${AUTHOR_EMAIL}> (id ${authorId}); set a password via admin reset`)
  }

  const stats = { seen: 0, imported: 0, skippedExisting: 0, skippedCategory: 0, failed: 0, images: 0, imageFail: 0, redirects: 0 }

  let processed = 0
  for (const entry of idx.articles) {
    if (only && !only.includes(entry.id)) continue
    if (processed >= limit) break
    stats.seen++

    const art = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, entry.file), 'utf8')) as Article
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

    // Dedup on legacyWpId.
    const existing = await payload.find({ collection: 'posts', where: { legacyWpId: { equals: art.id } }, limit: 1, depth: 0 })
    if (existing.docs[0] && !force) {
      stats.skippedExisting++
      continue
    }

    processed++
    if (dry) {
      console.log(`[dry] ${art.id}  ${art.title}  → ${catSlug} (${featuredType})`)
      stats.imported++
      continue
    }

    try {
      // Upload images: hero + inline. Build a local_path → mediaId map for the converter.
      const imgMap = new Map<string, number | string>()
      const uploadImage = async (img: NonNullable<Img>): Promise<number | string | null> => {
        const abs = path.join(CONTENT_ROOT, img.local_path)
        if (!fs.existsSync(abs)) return null
        try {
          const media = await payload.create({
            collection: 'media',
            data: { alt: (img.alt && img.alt.trim()) || art.title },
            filePath: abs,
          })
          stats.images++
          return media.id
        } catch (e) {
          stats.imageFail++
          console.warn(`  ⚠ image upload failed (${img.local_path}): ${(e as Error).message}`)
          return null
        }
      }

      let heroId: number | string | null = null
      if (!noImages) {
        if (art.hero_image) {
          heroId = await uploadImage(art.hero_image)
          if (heroId != null) imgMap.set(art.hero_image.local_path, heroId)
        }
        for (const img of art.inline_images ?? []) {
          const id = await uploadImage(img)
          if (id != null) imgMap.set(img.local_path, id)
        }
      }

      const resolve: ResolveImage = (src) => imgMap.get(src) ?? null
      const { state } = htmlToLexical(art.content_html ?? '', resolve, art.content_text ?? '')

      const data: Record<string, unknown> = {
        title: art.title,
        excerpt: art.excerpt || undefined,
        content: state,
        category: categoryId,
        authors: [authorId],
        publishedAt: new Date(art.date).toISOString(),
        slug: art.slug,
        legacyWpId: art.id,
        _status: 'published',
        seo: {
          metaDescription: art.seo?.description || art.excerpt || undefined,
          ...(heroId != null ? { ogImage: heroId } : {}),
        },
        featuredType,
        ...(featuredType === 'video' && videoUrl ? { featuredVideoUrl: videoUrl } : {}),
        ...(heroId != null ? { featuredImage: heroId } : {}),
      }

      let postId: number | string
      if (existing.docs[0]) {
        const updated = await payload.update({ collection: 'posts', id: existing.docs[0].id, data: data as never })
        postId = updated.id
      } else {
        const created = await payload.create({ collection: 'posts', data: data as never })
        postId = created.id
      }
      stats.imported++

      // 301 redirect: old single-segment WP path → new /<category>/<slug>-<id>.
      try {
        const fromPath = decodeURIComponent(new URL(art.source_url).pathname)
        const to = `/${catSlug}/${art.slug}-${postId}`
        const existingRedirect = await payload.find({ collection: 'redirects', where: { from: { equals: fromPath } }, limit: 1, depth: 0 })
        if (!existingRedirect.docs[0]) {
          await payload.create({ collection: 'redirects', data: { from: fromPath, to, type: '301', active: true } as never })
          stats.redirects++
        }
      } catch {
        /* redirect is best-effort; never fail the import over it */
      }

      console.log(`✓ ${art.id}  ${art.title.slice(0, 50)}  → /${catSlug}/…-${postId}  (${imgMap.size} imgs)`)
    } catch (e) {
      stats.failed++
      console.error(`✗ ${art.id}  ${art.title.slice(0, 50)}: ${(e as Error).message}`)
    }
  }

  console.log('\n──────── migration summary ────────')
  console.log(JSON.stringify(stats, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
