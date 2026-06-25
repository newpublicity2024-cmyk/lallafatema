import type { Category, Post } from '@/payload-types'
import { categoryUrl } from '@/lib/routes'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'

/** A homepage category block: heading + a grid of the latest posts in that category. */
export function SectionBlock({ category, posts }: { category: Category; posts: Post[] }) {
  if (!posts.length) return null

  return (
    <section className="py-6">
      <SectionHeading title={category.name} href={categoryUrl(category.slug ?? '')} />
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-4">
        {posts.slice(0, 4).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}
