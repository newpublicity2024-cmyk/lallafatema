import type { WidgetServerProps } from 'payload'

import type { Post, User } from '@/payload-types'

import { relativeTime } from '@/lib/format'

import {
  ADMIN,
  authorNamesOf,
  Card,
  categoryNameOf,
  draftWhere,
  editHref,
  EmptyState,
  Icons,
  isEditorial,
  reviewQueueWhere,
  titleOf,
} from './shared'

const LIMIT = 6

/**
 * Journalists: "مسوّداتي" — pick up where you left off.
 * Editors/admins: "بانتظار المراجعة" — the newsroom's queue, newest edit first.
 */
export default async function Drafts({ req }: WidgetServerProps) {
  const { payload } = req
  const user = req.user as User | null
  if (!user) return null

  const editorial = isEditorial(user)
  const where = editorial ? reviewQueueWhere(user) : draftWhere(user)

  const { docs, totalDocs } = await payload.find({
    collection: 'posts',
    where,
    sort: '-updatedAt',
    limit: LIMIT,
    depth: 1, // category title + author names
    user,
    overrideAccess: false,
  })
  const drafts = docs as Post[]

  const listHref = `${ADMIN}/collections/posts?where[_status][equals]=draft${
    editorial ? '' : `&where[authors][in][0]=${user.id}`
  }`

  return (
    <Card
      title={editorial ? 'بانتظار المراجعة' : 'مسوّداتي'}
      icon={<Icons.draft />}
      action={
        totalDocs > 0 ? (
          <a className="lf-link" href={listHref}>
            عرض الكل ({totalDocs})
          </a>
        ) : undefined
      }
    >
      {drafts.length === 0 ? (
        <EmptyState
          icon="✨"
          title={editorial ? 'لا توجد مسوّدات بانتظارك' : 'لا توجد مسوّدات'}
          hint={
            editorial
              ? 'كل ما كتبه الفريق تمّت مراجعته.'
              : 'ابدأ مقالًا جديدًا؛ سيظهر هنا لتكمله لاحقًا.'
          }
          action={
            editorial ? undefined : (
              <a className="lf-btn lf-btn--primary" href={`${ADMIN}/collections/posts/create`}>
                <Icons.pen />
                اكتب مقالًا جديدًا
              </a>
            )
          }
        />
      ) : (
        <ul className="lf-list">
          {drafts.map((d) => {
            const category = categoryNameOf(d)
            const author = editorial ? authorNamesOf(d) : null
            return (
              <li key={d.id} className="lf-row">
                <a className="lf-row__main" href={editHref(d)}>
                  <span className={`lf-row__title ${d.title ? '' : 'lf-row__title--muted'}`}>
                    {titleOf(d)}
                  </span>
                  <span className="lf-row__meta">
                    {author && <span>{author}</span>}
                    {category && <span className="lf-chip">{category}</span>}
                    <span>آخر تعديل {relativeTime(d.updatedAt)}</span>
                  </span>
                </a>
                <a className="lf-btn lf-btn--soft lf-row__action" href={editHref(d)}>
                  {editorial ? 'مراجعة' : 'متابعة الكتابة'}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
