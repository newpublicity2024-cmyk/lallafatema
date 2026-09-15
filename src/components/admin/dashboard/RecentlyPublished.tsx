import type { WidgetServerProps } from 'payload'

import type { Post, User } from '@/payload-types'

import { formatDate } from '@/lib/format'
import { postUrl } from '@/lib/routes'

import {
  ADMIN,
  authorNamesOf,
  Card,
  categoryNameOf,
  editHref,
  EmptyState,
  Icons,
  isEditorial,
  publishedWhere,
  titleOf,
} from './shared'

const LIMIT = 6

/** What just went live — for a journalist, only their own bylines. */
export default async function RecentlyPublished({ req }: WidgetServerProps) {
  const { payload } = req
  const user = req.user as User | null
  if (!user) return null

  const editorial = isEditorial(user)

  const { docs } = await payload.find({
    collection: 'posts',
    where: publishedWhere(user),
    sort: '-publishedAt',
    limit: LIMIT,
    depth: 1,
    user,
    overrideAccess: false,
  })
  const posts = docs as Post[]

  const listHref = `${ADMIN}/collections/posts?where[_status][equals]=published&sort=-publishedAt${
    editorial ? '' : `&where[authors][in][0]=${user.id}`
  }`

  return (
    <Card
      title={editorial ? 'نُشر مؤخرًا' : 'آخر ما نُشر لي'}
      icon={<Icons.check />}
      action={
        posts.length > 0 ? (
          <a className="lf-link" href={listHref}>
            عرض الكل
          </a>
        ) : undefined
      }
    >
      {posts.length === 0 ? (
        <EmptyState
          icon="📰"
          title="لم يُنشر شيء بعد"
          hint={
            editorial
              ? 'المقالات التي تنشرها ستظهر هنا.'
              : 'حين ينشر المحرّر مقالك سيظهر هنا مع رابطه على الموقع.'
          }
        />
      ) : (
        <ul className="lf-list">
          {posts.map((p) => {
            const category = categoryNameOf(p)
            const author = editorial ? authorNamesOf(p) : null
            return (
              <li key={p.id} className="lf-row">
                <a className="lf-row__main" href={editHref(p)}>
                  <span className="lf-row__title">{titleOf(p)}</span>
                  <span className="lf-row__meta">
                    {author && <span>{author}</span>}
                    {category && <span className="lf-chip">{category}</span>}
                    {p.publishedAt && <span>{formatDate(p.publishedAt)}</span>}
                  </span>
                </a>
                <a
                  className="lf-btn lf-btn--soft lf-row__action"
                  href={postUrl(p)}
                  target="_blank"
                  rel="noreferrer"
                  title="عرض على الموقع"
                >
                  <Icons.eye />
                  عرض
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
