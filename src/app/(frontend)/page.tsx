import { HeroFeature } from '@/components/HeroFeature'
import { SectionBlock } from '@/components/SectionBlock'
import { getCategories, getLatestPosts, getPostsByCategory } from '@/lib/queries'

// ISR: statically generated, revalidated on an interval (and on-publish in Phase 3).
export const revalidate = 300

export default async function HomePage() {
  const categories = await getCategories()
  const topLevel = categories.filter((c) => !c.parent)

  const heroPosts = await getLatestPosts(5)

  const sections = await Promise.all(
    topLevel.map(async (category) => ({
      category,
      posts: await getPostsByCategory(category.id, 4),
    })),
  )

  return (
    <main className="mx-auto max-w-7xl px-4">
      <HeroFeature posts={heroPosts} />
      {sections.map(({ category, posts }) => (
        <SectionBlock key={category.id} category={category} posts={posts} />
      ))}
    </main>
  )
}
