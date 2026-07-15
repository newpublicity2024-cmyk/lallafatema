import type { Category, MagazineIssue, Post } from '@/payload-types'
import { categoryUrl } from '@/lib/routes'
import { Carousel } from './Carousel'
import { MagazineRail } from './MagazineRail'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'

/**
 * Featured section (foochia "lead + stacked list"): one large lead card on one
 * side, a column of compact (thumbnail + headline) cards on the other. Used for a
 * spotlight category such as مشاهير. `band` paints a full-bleed light background.
 *
 * Optionally takes `magazineIssue` — the newest issue — which adds a narrow
 * `MagazineRail` column at `lg+`. Under RTL that column is the LAST DOM child, so
 * it lands on the visual left; the rail brings its own `lg:border-s` split.
 */
export function LeadListBlock({
  category,
  posts,
  title,
  magazineIssue,
  band = false,
}: {
  category: Category
  posts: Post[]
  title?: string
  /** Newest issue for the rail. Optional/nullable: not every caller has one, and
   *  the site can legitimately have zero published issues. */
  magazineIssue?: MagazineIssue | null
  band?: boolean
}) {
  if (!posts.length) return null
  const [lead, ...rest] = posts
  const list = rest.slice(0, 4)

  return (
    <section className={band ? 'lf-band' : ''}>
      <div className="lf-container py-12">
        <SectionHeading title={title || category.name} href={categoryUrl(category.slug ?? '')} />

        {/* Mobile (<md): swipe carousel of the section's posts, then the rail stacked below. */}
        <div className="md:hidden">
          <Carousel>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </Carousel>
          {magazineIssue && (
            <div className="mt-8">
              <MagazineRail issue={magazineIssue} />
            </div>
          )}
        </div>

        {/* Desktop (md+): lead card + stacked compact list. At lg+ a third, narrower
            magazine-rail column joins them (12-col grid: 5 + 4 + 3) — but only when
            there's an issue to show, else the 2-col layout stays as it was. The rail
            is last in DOM order, which under dir="rtl" puts it on the visual left.
            At md (768–1023) all three stack full-width. */}
        <div className="hidden md:block">
          <div
            className={`grid grid-cols-1 gap-6 ${magazineIssue ? 'lg:grid-cols-12' : 'lg:grid-cols-2'}`}
          >
            <div className={magazineIssue ? 'lg:col-span-5' : ''}>
              <PostCard post={lead} variant="lead" />
            </div>
            {list.length > 0 && (
              <div className={`flex flex-col gap-5 ${magazineIssue ? 'lg:col-span-4' : ''}`}>
                {list.map((post) => (
                  <PostCard key={post.id} post={post} variant="compact" />
                ))}
              </div>
            )}
            {magazineIssue && (
              <div className="lg:col-span-3">
                <MagazineRail issue={magazineIssue} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
