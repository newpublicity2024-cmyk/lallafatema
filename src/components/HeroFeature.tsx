import type { Post } from '@/payload-types'
import { PostCard } from './PostCard'

/**
 * Homepage hero.
 * - Mobile (<md): the hero posts stack one after another as big 4:5 overlay posters.
 * - Desktop (md+): one large overlay lead beside a 2×2 grid of the next stories
 *   (unchanged). The lead card is shared across both branches — one image, keeping
 *   LCP priority; only the below-fold secondaries duplicate between branches.
 */
export function HeroFeature({ posts }: { posts: Post[] }) {
  if (!posts.length) return null
  const [lead, ...rest] = posts
  const secondary = rest.slice(0, 4)

  return (
    <section data-testid="hero">
      <div className="lf-container py-6 md:grid md:grid-cols-1 md:items-stretch md:gap-6 md:py-8 lg:grid-cols-12">
        {/* Lead — shared. Full width on mobile; col-span-7 at lg. Keeps LCP priority. */}
        <div className="lg:col-span-7">
          <PostCard post={lead} variant="overlay" fill />
        </div>

        {/* Mobile (<md): the remaining hero posts as big stacked posters. */}
        {secondary.length > 0 && (
          <div className="mt-6 flex flex-col gap-6 md:hidden">
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} variant="overlay" priority={false} />
            ))}
          </div>
        )}

        {/* Desktop (md+): the original flanked 2×2 grid. Unchanged. */}
        {secondary.length > 0 && (
          <div className="hidden grid-cols-2 gap-6 md:grid lg:col-span-5">
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
