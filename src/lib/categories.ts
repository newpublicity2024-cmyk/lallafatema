/**
 * Canonical category set from the original lallafatema.ma, used to seed the DB
 * and as the default navigation order. Editors can add/reorder later (Phase 3).
 */
export type SeedCategory = {
  name: string
  slug: string
  children?: SeedCategory[]
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: 'مشاهير', slug: 'celebrities' },
  { name: 'آخر الأخبار', slug: 'news' },
  { name: 'موضة', slug: 'fashion' },
  { name: 'جمال', slug: 'beauty' },
  { name: 'صحة', slug: 'health' },
  { name: 'لايف ستايل', slug: 'lifestyle' },
  {
    name: 'مطبخ',
    slug: 'kitchen',
    children: [{ name: 'شهيوات لالة فاطمة', slug: 'lalla-fatema-recipes' }],
  },
  { name: 'عروس', slug: 'bride' },
  { name: 'فيديو', slug: 'video' },
]
