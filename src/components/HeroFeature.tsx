import type { Post } from '@/payload-types'
import { PostCard } from './PostCard'

/**
 * Homepage hero: one large overlay feature beside a denser 2×2 grid of the next
 * stories (layalina's flanked hero / foochia's hero band). Static, no JS, fast LCP.
 */
export function HeroFeature({ posts }: { posts: Post[] }) {
  if (!posts.length) return null
  const [lead, ...rest] = posts
  const secondary = rest.slice(0, 4)

  return (
    <section>
      <div className="lf-container grid grid-cols-1 gap-5 py-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PostCard post={lead} variant="overlay" />
        </div>
        {secondary.length > 0 && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 lg:col-span-5">
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
