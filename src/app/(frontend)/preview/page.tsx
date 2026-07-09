import { notFound } from 'next/navigation'

import { ArticleView } from '@/components/ArticleView'
import { PageView } from '@/components/PageView'
import { RefreshRouteOnSave } from '@/components/RefreshRouteOnSave'
import { getPageById, getPostById, getRelatedPosts } from '@/lib/queries'

// Editor-only draft preview — always dynamic (never statically cached).
export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ secret?: string; collection?: string; id?: string }>
}

export default async function PreviewPage({ searchParams }: Props) {
  const { secret, collection, id } = await searchParams

  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    notFound()
  }

  if (collection === 'posts' && id) {
    const post = await getPostById(Number(id), true)
    if (!post) notFound()
    const related = await getRelatedPosts(post, 4)
    return (
      <>
        <div className="sticky top-0 z-50 bg-amber-400 px-4 py-1.5 text-center text-sm font-bold text-amber-950">
          معاينة المسودة — هذه نسخة غير منشورة
        </div>
        <RefreshRouteOnSave />
        <ArticleView post={post} related={related} />
      </>
    )
  }

  if (collection === 'pages' && id) {
    const page = await getPageById(Number(id), true)
    if (!page) notFound()
    return (
      <>
        <div className="sticky top-0 z-50 bg-amber-400 px-4 py-1.5 text-center text-sm font-bold text-amber-950">
          معاينة المسودة — هذه نسخة غير منشورة
        </div>
        <RefreshRouteOnSave />
        <PageView page={page} />
      </>
    )
  }

  notFound()
}
