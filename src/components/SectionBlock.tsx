import type { Category, Post } from '@/payload-types'
import { categoryUrl } from '@/lib/routes'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'

/**
 * A homepage category block: heading + 4-up rows of posts (latest or admin-pinned).
 * `band` paints a full-bleed light-gray background (foochia's alternating sections);
 * content stays aligned via the inner `.lf-container`.
 */
export function SectionBlock({
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

  return (
    <section className={band ? 'lf-band' : ''}>
      <div className="lf-container py-12">
        <SectionHeading title={title || category.name} href={categoryUrl(category.slug ?? '')} />
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  )
}
