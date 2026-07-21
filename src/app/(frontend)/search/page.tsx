import type { Metadata } from 'next'

import { PostCard } from '@/components/PostCard'
import { getPostsByIds } from '@/lib/queries'
import { searchEnabled, searchPostIds } from '@/lib/search'
import { buildMetadata } from '@/lib/seo'

type SearchParams = Promise<{ q?: string }>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const { q } = await searchParams
  const query = q?.trim() ?? ''
  return buildMetadata({
    title: query ? `بحث: ${query}` : 'بحث',
    path: '/search',
    noIndex: true,
  })
}

function SearchForm({ q }: { q: string }) {
  return (
    <form action="/search" method="get" role="search" className="mx-auto flex max-w-xl gap-2">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="ابحث في المقالات…"
        aria-label="بحث"
        className="flex-1 rounded-full border border-zinc-300 px-5 py-3 text-zinc-900 outline-none focus:border-brand-500"
      />
      <button
        type="submit"
        className="rounded-full bg-brand-600 px-6 py-3 font-bold text-white transition-colors hover:bg-brand-700"
      >
        بحث
      </button>
    </form>
  )
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  const enabled = searchEnabled()
  const ids = enabled && query ? await searchPostIds(query) : []
  const posts = ids.length ? await getPostsByIds(ids) : []

  return (
    <div className="lf-container py-10">
      <h1 className="mb-6 text-center text-3xl font-bold text-zinc-900">البحث</h1>
      <SearchForm q={query} />

      <div className="mt-10">
        {!enabled ? (
          <p className="text-center text-zinc-700">البحث سيتوفر قريبًا.</p>
        ) : !query ? (
          <p className="text-center text-zinc-700">اكتب كلمة للبحث في المقالات.</p>
        ) : posts.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-center text-zinc-700">لا توجد نتائج لـ «{query}».</p>
        )}
      </div>
    </div>
  )
}
