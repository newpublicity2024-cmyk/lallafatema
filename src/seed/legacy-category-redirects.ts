/**
 * 301s for the old WordPress *category* archives.
 *
 * `migrate-wp.ts` creates a redirect per imported article, but nothing covered the old
 * category pages, which WordPress served nested under `/category/...` (mostly below the
 * `الرئيسية` parent). Those paths are indexed, so without this they 404 at DNS cutover.
 *
 * Paths and post counts were read from the live WP REST API
 * (`/wp-json/wp/v2/categories`). Each old archive maps to the closest live category
 * rather than to the homepage: a pile of 301s onto `/` reads as a soft 404 to Google,
 * whereas a topical archive is a genuine equivalent. Categories WP reported as empty are
 * still mapped — an indexed URL can outlive its last post.
 *
 * Idempotent: an existing `from` is left untouched, so this is safe to re-run.
 *
 * Usage:
 *   tsx src/seed/legacy-category-redirects.ts [--dry]
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

/** Old WP category path → destination on the new site. */
const CATEGORY_REDIRECTS: Record<string, string> = {
  // The WP "home" bucket — the site root is its only honest equivalent.
  '/category/الرئيسية/': '/',

  // Generic news buckets.
  '/category/أخبار/': '/news',
  '/category/الرئيسية/اخر-الأخبار/': '/news',
  '/category/الرئيسية/اخبار-حصرية/': '/news',
  '/category/غير-مصنف/': '/news',
  '/category/الرئيسية/غير-مصنف-الرئيسية/': '/news',
  '/category/صباحيات-لالة-فاطمة/': '/news',
  '/category/الرئيسية/دين-و-دنيا/': '/news',

  // Direct equivalents.
  '/category/الرئيسية/مشاهير/': '/celebrities',
  '/category/الرئيسية/جمال/': '/beauty',
  '/category/الرئيسية/صحة/': '/health',
  '/category/الرئيسية/مطبخ/': '/kitchen',
  '/category/الرئيسية/مطبخ-2/': '/kitchen', // duplicate kitchen term in WP
  '/category/الرئيسية/فيديوهات/': '/video',
  '/category/الرئيسية/لايف-ستايل/': '/lifestyle',
  '/category/الرئيسية/موضة/': '/fashion',

  // Archives with no direct counterpart → nearest topical home. Their articles were
  // imported into fallback categories, so the old archive has no 1:1 replacement.
  '/category/الرئيسية/حوارات/': '/celebrities', // interviews, celebrity-led
  '/category/الرئيسية/البوم-الصور/': '/celebrities',
  '/category/الرئيسية/جمال-و-موضة/': '/beauty',
  '/category/الرئيسية/قفطان/': '/fashion', // kaftans
  '/category/الرئيسية/عروس/': '/fashion', // bride; the `bride` category is empty, so don't send traffic there
  '/category/الرئيسية/اسرة/': '/lifestyle', // family
  '/category/الرئيسية/اولادنا/': '/lifestyle', // our children
  '/category/الرئيسية/ازواج/': '/lifestyle', // couples
  '/category/الرئيسية/جنس/': '/health',

  // Magazine issues were deferred by the article importer but have their own section.
  '/category/الرئيسية/اعداد-للا-فاطمة/': '/magazine',
}

const DRY = process.argv.includes('--dry')

const main = async () => {
  const payload = await getPayload({ config })
  const stats = { seen: 0, created: 0, existing: 0 }

  for (const [from, to] of Object.entries(CATEGORY_REDIRECTS)) {
    stats.seen++
    const { docs } = await payload.find({
      collection: 'redirects',
      where: { from: { equals: from } },
      limit: 1,
      depth: 0,
    })
    if (docs[0]) {
      stats.existing++
      console.log(`· exists  ${from} → ${docs[0].to}`)
      continue
    }
    if (DRY) {
      stats.created++
      console.log(`[dry]     ${from} → ${to}`)
      continue
    }
    await payload.create({
      collection: 'redirects',
      data: { from, to, type: '301', active: true } as never,
    })
    stats.created++
    console.log(`✓ created ${from} → ${to}`)
  }

  console.log('\n──────── category redirect summary ────────')
  console.log(JSON.stringify(stats, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
