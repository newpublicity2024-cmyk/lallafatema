import type { Category, Post } from '@/payload-types'
import { categoryUrl } from '@/lib/routes'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'

/**
 * Featured section (foochia "lead + stacked list"): one large lead card on one
 * side, a column of compact (thumbnail + headline) cards on the other. Used for a
 * spotlight category such as مشاهير. `band` paints a full-bleed light background.
 */
export function LeadListBlock({
  category,
  posts,
  title,
  band = false,
}: {
  category: Category
  posts: Post[]
  title?: string
  band?: boolean
}) {
  if (!posts.length) return null
  const [lead, ...rest] = posts
  const list = rest.slice(0, 4)

  return (
    <section className={band ? 'lf-band' : ''}>
      <div className="lf-container py-12">
        <SectionHeading title={title || category.name} href={categoryUrl(category.slug ?? '')} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PostCard post={lead} variant="lead" />
          {list.length > 0 && (
            <div className="flex flex-col gap-5">
              {list.map((post) => (
                <PostCard key={post.id} post={post} variant="compact" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
