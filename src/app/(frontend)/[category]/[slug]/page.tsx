import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleView } from '@/components/ArticleView'
import { getPostById, getRelatedPosts } from '@/lib/queries'
import { idFromSlugParam } from '@/lib/routes'

export const revalidate = 3600

type Props = { params: Promise<{ category: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  const post = id ? await getPostById(id) : null
  if (!post) return {}
  return {
    title: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt || undefined,
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  if (!id) notFound()

  const post = await getPostById(id)
  if (!post) notFound()

  const related = await getRelatedPosts(post, 4)
  return <ArticleView post={post} related={related} />
}
