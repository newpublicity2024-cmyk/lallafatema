import type { Post } from '@/payload-types'
import { PostCard } from './PostCard'

/**
 * Homepage hero: one large overlay feature + a column of the next stories.
 * Static (no JS) for a fast LCP. The editor-controlled slider arrives in Phase 3.
 */
export function HeroFeature({ posts }: { posts: Post[] }) {
  if (!posts.length) return null
  const [lead, ...rest] = posts

  return (
    <section className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <PostCard post={lead} variant="overlay" />
      </div>
      <div className="flex flex-col gap-5">
        {rest.slice(0, 4).map((post) => (
          <PostCard key={post.id} post={post} variant="compact" />
        ))}
      </div>
    </section>
  )
}
