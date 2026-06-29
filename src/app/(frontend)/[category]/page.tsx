import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import { getCategories, getCategoryBySlug, getPosts } from '@/lib/queries'
import { categoryUrl } from '@/lib/routes'

export const revalidate = 300

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.filter((c) => c.slug).map((c) => ({ category: c.slug as string }))
}

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return {}
  return { title: category.name }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const { docs, totalPages } = await getPosts({ categoryId: category.id, limit: 16, page })

  return (
    <main className="lf-container py-8">
      <SectionHeading title={category.name} />

      {docs.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">لا توجد مقالات في هذا القسم بعد.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {docs.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination basePath={categoryUrl(slug)} page={page} totalPages={totalPages} />
    </main>
  )
}
