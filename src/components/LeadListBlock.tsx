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

  // The lead's wrapper is itself `grid`, not a plain block: the wrapper is the grid
  // item that stretches to the row height, and a single-item grid container passes
  // that stretch down so the `.lf-card` article fills it (a block wrapper would leave
  // the card auto-height and expose the band beneath it).
  // Spans: 5 + 4 + 3 = 12. With a rail but no list there is no 4-col column, so the
  // lead absorbs it (9 + 3) instead of leaving four dead columns at the visual left.
  const leadClass = magazineIssue
    ? `grid ${list.length ? 'lg:col-span-5' : 'lg:col-span-9'}`
    : 'grid'

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
            magazine-rail column joins them (12-col grid: 5 + 4 + 3, see `leadClass`) —
            but only when there's an issue to show, else the 2-col layout stays as it
            was. The rail is last in DOM order, which under dir="rtl" puts it on the
            visual left. At md (768–1023) all three stack full-width. */}
        <div className="hidden md:block">
          <div
            className={`grid grid-cols-1 gap-6 ${magazineIssue ? 'lg:grid-cols-12' : 'lg:grid-cols-2'}`}
          >
            <div className={leadClass}>
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
              // `grid` (like `leadClass`): stretches the aside to the row so its
              // vertical split rule spans the full height even when the compact
              // list is the tallest column (a section limit of 5+ → 4 cards).
              <div className="grid lg:col-span-3">
                <MagazineRail issue={magazineIssue} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
