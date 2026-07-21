import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { PageView } from '@/components/PageView'
import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import {
  getCategories,
  getCategoryBySlug,
  getPageBySlug,
  getPosts,
  getPublishedPages,
  getSiteConfig,
} from '@/lib/queries'
import { categoryUrl, pageUrl } from '@/lib/routes'
import { buildMetadata, ogImageUrl, breadcrumbJsonLd } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  const [categories, pages] = await Promise.all([getCategories(), getPublishedPages()])
  return [
    ...categories.filter((c) => c.slug).map((c) => ({ category: c.slug as string })),
    ...pages.filter((p) => p.slug).map((p) => ({ category: p.slug as string })),
  ]
}

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params

  const category = await getCategoryBySlug(slug)
  if (category) {
    const cfg = await getSiteConfig()
    return buildMetadata({
      title: category.seo?.metaTitle || category.name,
      description: category.seo?.metaDescription || category.description,
      path: categoryUrl(category.slug ?? slug),
      image: ogImageUrl(category.seo?.ogImage, cfg.defaultOgImage),
      type: 'website',
      noIndex: category.seo?.noIndex ?? false,
      canonicalOverride: category.seo?.canonicalURL,
    })
  }

  const page = await getPageBySlug(slug)
  if (page) {
    const cfg = await getSiteConfig()
    return buildMetadata({
      title: page.seo?.metaTitle || page.title,
      description: page.seo?.metaDescription || undefined,
      path: pageUrl(page.slug ?? slug),
      image: ogImageUrl(page.seo?.ogImage, cfg.defaultOgImage),
      type: 'website',
      noIndex: page.seo?.noIndex ?? false,
      canonicalOverride: page.seo?.canonicalURL,
    })
  }

  return {}
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params

  const category = await getCategoryBySlug(slug)
  if (category) {
    const { page: pageParam } = await searchParams
    const page = Math.max(1, Number(pageParam) || 1)

    const crumbs = [
      { name: 'الرئيسية', url: '/' },
      { name: category.name, url: categoryUrl(category.slug ?? slug) },
    ]

    const { docs, totalPages } = await getPosts({ categoryId: category.id, limit: 16, page })

    return (
      <div className="lf-container py-8">
        <JsonLd data={breadcrumbJsonLd(crumbs)} />
        <SectionHeading title={category.name} />

        {docs.length === 0 ? (
          <p className="py-16 text-center text-zinc-700">لا توجد مقالات في هذا القسم بعد.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {docs.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        <Pagination basePath={categoryUrl(slug)} page={page} totalPages={totalPages} />
      </div>
    )
  }

  const page = await getPageBySlug(slug)
  if (page) return <PageView page={page} />

  notFound()
}
