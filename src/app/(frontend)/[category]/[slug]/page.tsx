import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleView } from '@/components/ArticleView'
import { JsonLd } from '@/components/JsonLd'
import { getPostById, getRelatedPosts, getSiteConfig } from '@/lib/queries'
import { idFromSlugParam, postUrl, categoryUrl } from '@/lib/routes'
import {
  buildMetadata,
  ogImageUrl,
  newsArticleJsonLd,
  recipeJsonLd,
  breadcrumbJsonLd,
  videoObjectJsonLdForPost,
} from '@/lib/seo'

export const revalidate = 3600

type Props = { params: Promise<{ category: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  const post = id ? await getPostById(id) : null
  if (!post) return {}
  const cfg = await getSiteConfig()
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const featured =
    post.featuredImage && typeof post.featuredImage === 'object' ? post.featuredImage : null
  const authorNames = (post.authors ?? [])
    .filter((a): a is Extract<typeof a, { id: number }> => typeof a === 'object')
    .map((a) => a.name)
  return buildMetadata({
    title: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    path: postUrl(post),
    // Fallback chain matches newsArticleJsonLd: seo.ogImage → featuredImage → defaultOgImage.
    image: ogImageUrl(post.seo?.ogImage, featured ?? cfg.defaultOgImage),
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: authorNames,
    section: category?.name,
    noIndex: post.seo?.noIndex ?? false,
    canonicalOverride: post.seo?.canonicalURL,
  })
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const id = idFromSlugParam(slug)
  if (!id) notFound()

  const post = await getPostById(id)
  if (!post) notFound()

  const [related, cfg] = await Promise.all([getRelatedPosts(post, 4), getSiteConfig()])
  const category = post.category && typeof post.category === 'object' ? post.category : null
  const recipe = recipeJsonLd(post)
  const videoLd = videoObjectJsonLdForPost(post)

  const crumbs = [
    { name: 'الرئيسية', url: '/' },
    ...(category ? [{ name: category.name, url: categoryUrl(category.slug ?? '') }] : []),
    { name: post.title, url: postUrl(post) },
  ]

  return (
    <>
      <JsonLd data={newsArticleJsonLd(post, cfg)} />
      {recipe && <JsonLd data={recipe} />}
      {videoLd && <JsonLd data={videoLd} />}
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <ArticleView post={post} related={related} />
    </>
  )
}
