import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'

import type { Page } from '@/payload-types'
import { formatDate } from '@/lib/format'
import { pageShowsUpdatedDate } from '@/lib/routes'

/** Renders one static/legal page: breadcrumb, title, optional last-updated, rich body. */
export function PageView({ page }: { page: Page }) {
  const showUpdated = pageShowsUpdatedDate(page.slug ?? '')

  return (
    <div className="mx-auto max-w-[800px] px-4 py-8">
      <article>
        <nav className="mb-3 text-sm text-zinc-500">
          <Link href="/" className="hover:text-brand-600">الرئيسية</Link>
          <span className="px-1">/</span>
          <span className="text-zinc-700">{page.title}</span>
        </nav>

        <h1 className="text-3xl font-extrabold leading-tight text-zinc-900 sm:text-4xl">{page.title}</h1>

        {showUpdated && page.updatedAt && (
          <p className="mt-2 text-sm text-zinc-500">
            آخر تحديث:{' '}
            <time dateTime={new Date(page.updatedAt).toISOString()}>{formatDate(page.updatedAt)}</time>
          </p>
        )}

        {page.content && (
          <div className="mt-6">
            <RichText data={page.content} className="prose-ar" />
          </div>
        )}
      </article>
    </div>
  )
}
