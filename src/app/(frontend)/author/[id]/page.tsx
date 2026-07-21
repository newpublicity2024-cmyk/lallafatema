import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { PostImage } from '@/components/PostImage'
import { SectionHeading } from '@/components/SectionHeading'
import { buildMetadata, ogImageUrl } from '@/lib/seo'
import { getAuthorById, getPostsByAuthor, getSiteConfig } from '@/lib/queries'
import { authorUrl } from '@/lib/routes'

export const revalidate = 300

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const author = await getAuthorById(Number(id))
  if (!author) return {}
  const cfg = await getSiteConfig()
  const title = author.title ? `${author.name} — ${author.title}` : author.name
  return buildMetadata({
    title,
    description: author.bio,
    path: authorUrl(author.id),
    image: ogImageUrl(author.avatar, cfg.defaultOgImage),
    type: 'profile',
  })
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { id } = await params
  const { page: pageParam } = await searchParams
  const authorId = Number(id)
  if (!authorId) notFound()

  const author = await getAuthorById(authorId)
  if (!author) notFound()

  const page = Math.max(1, Number(pageParam) || 1)
  const { docs, totalPages } = await getPostsByAuthor(authorId, 12, page)

  return (
    <div className="lf-container py-8">
      <header className="mb-8 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
        <div className="relative h-24 w-24 flex-none overflow-hidden rounded-full bg-brand-100">
          <PostImage image={author.avatar} alt={author.name} sizes="96px" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">{author.name}</h1>
          {author.title && <p className="text-brand-700">{author.title}</p>}
          {author.bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">{author.bio}</p>}
        </div>
      </header>

      <SectionHeading title="أحدث المقالات" />
      {docs.length === 0 ? (
        <p className="py-16 text-center text-zinc-700">لا توجد مقالات منشورة بعد.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {docs.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination basePath={authorUrl(authorId)} page={page} totalPages={totalPages} />
    </div>
  )
}
