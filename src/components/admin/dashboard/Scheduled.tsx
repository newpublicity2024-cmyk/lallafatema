import type { WidgetServerProps } from 'payload'

import type { Post, User } from '@/payload-types'

import { scheduleLabel } from '@/lib/schedule'

import {
  ADMIN,
  authorNamesOf,
  Card,
  categoryNameOf,
  editHref,
  EmptyState,
  Icons,
  isEditorial,
  scheduledWhere,
  titleOf,
} from './shared'

const LIMIT = 6

/**
 * "مبرمج للنشر" — articles that are published but whose moment has not arrived.
 *
 * The one surface in the back office where a programmed article is visible AS programmed.
 * Everywhere else it is correctly absent: the reader cannot see it, and the dashboard's
 * published tiles and "نُشر مؤخرًا" now exclude it (see `publishedWhere` in shared.tsx).
 * Without this card a writer would schedule a story and have nowhere to confirm it.
 *
 * Soonest first — `sort: 'publishedAt'` ascending — because the next thing to go out is
 * the thing you want to check, the opposite of every other list here.
 */
export default async function Scheduled({ req }: WidgetServerProps) {
  const { payload } = req
  const user = req.user as User | null
  if (!user) return null

  const editorial = isEditorial(user)
  const now = new Date()

  const { docs, totalDocs } = await payload.find({
    collection: 'posts',
    where: scheduledWhere(user, now),
    sort: 'publishedAt',
    limit: LIMIT,
    depth: 1, // category title + author names
    user,
    overrideAccess: false,
  })
  const posts = docs as Post[]

  /*
   * The same filter as a list-view URL. Payload's list reads `where[...]` query params
   * with operators, so the card's "عرض الكل" lands on exactly the rows it is summarising
   * rather than on "all published" — which would include everything already live.
   */
  const listHref =
    `${ADMIN}/collections/posts?where[_status][equals]=published` +
    `&where[publishedAt][greater_than]=${encodeURIComponent(now.toISOString())}` +
    `&sort=publishedAt${editorial ? '' : `&where[authors][in][0]=${user.id}`}`

  return (
    <Card
      title="مبرمج للنشر"
      icon={<Icons.clock />}
      action={
        totalDocs > LIMIT ? (
          <a className="lf-link" href={listHref}>
            عرض الكل ({totalDocs})
          </a>
        ) : undefined
      }
    >
      {posts.length === 0 ? (
        <EmptyState
          icon="⏰"
          title="لا يوجد مقال مبرمج"
          hint={
            editorial
              ? 'أي مقال يُنشر بموعد مستقبلي سيظهر هنا حتى يحين وقته.'
              : 'تريد نشر مقال في وقت محدّد؟ اختر «موعد النشر» من جانب المقال ثم اضغط «نشر».'
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
                  <span className={`lf-row__title ${p.title ? '' : 'lf-row__title--muted'}`}>
                    {titleOf(p)}
                  </span>
                  <span className="lf-row__meta">
                    {author && <span>{author}</span>}
                    {category && <span className="lf-chip">{category}</span>}
                    {/* The whole point of the row: when it goes out, in newsroom time. */}
                    {p.publishedAt && (
                      <span className="lf-chip lf-chip--time">
                        {scheduleLabel(p.publishedAt, now)}
                      </span>
                    )}
                  </span>
                </a>
                <a className="lf-btn lf-btn--soft lf-row__action" href={editHref(p)}>
                  تعديل الموعد
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
