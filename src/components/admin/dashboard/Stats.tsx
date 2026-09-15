import type { WidgetServerProps } from 'payload'

import type { User } from '@/payload-types'

import {
  ADMIN,
  daysAgo,
  draftWhere,
  Icons,
  isEditorial,
  publishedWhere,
  reviewQueueWhere,
  startOfTodayCasablanca,
} from './shared'

/**
 * A strip of numbers that answer "where do I stand?" — not "how big is the
 * database". Journalists see only their own work; editors see the newsroom.
 * Each tile links to the matching filtered list.
 */
export default async function Stats({ req }: WidgetServerProps) {
  const { payload } = req
  const user = req.user as User | null
  if (!user) return null

  const editorial = isEditorial(user)
  const count = (where: Parameters<typeof payload.count>[0]['where']) =>
    payload
      .count({ collection: 'posts', where, user, overrideAccess: false })
      .then((r) => r.totalDocs)

  const posts = `${ADMIN}/collections/posts`
  const mine = editorial ? '' : `&where[authors][in][0]=${user.id}`

  const tiles = editorial
    ? await Promise.all([
        count(reviewQueueWhere(user)).then((n) => ({
          key: 'queue',
          icon: <Icons.draft />,
          value: n,
          label: 'بانتظار المراجعة',
          hint: 'مسوّدات الفريق',
          href: `${posts}?where[_status][equals]=draft`,
          tone: n > 0 ? 'warm' : 'calm',
        })),
        count(publishedWhere(user, startOfTodayCasablanca())).then((n) => ({
          key: 'today',
          icon: <Icons.sparkle />,
          value: n,
          label: 'نُشر اليوم',
          hint: 'منذ منتصف الليل',
          href: `${posts}?where[_status][equals]=published&sort=-publishedAt`,
          tone: 'calm',
        })),
        count(publishedWhere(user, daysAgo(7))).then((n) => ({
          key: 'week',
          icon: <Icons.clock />,
          value: n,
          label: 'نُشر هذا الأسبوع',
          hint: 'آخر 7 أيام',
          href: `${posts}?where[_status][equals]=published&sort=-publishedAt`,
          tone: 'calm',
        })),
        count(publishedWhere(user)).then((n) => ({
          key: 'all',
          icon: <Icons.check />,
          value: n,
          label: 'مقال منشور',
          hint: 'على الموقع الآن',
          href: `${posts}?where[_status][equals]=published`,
          tone: 'calm',
        })),
      ])
    : await Promise.all([
        count(draftWhere(user)).then((n) => ({
          key: 'drafts',
          icon: <Icons.draft />,
          value: n,
          label: 'مسوّداتي',
          hint: 'قيد الكتابة',
          href: `${posts}?where[_status][equals]=draft${mine}`,
          tone: n > 0 ? 'warm' : 'calm',
        })),
        count(publishedWhere(user, daysAgo(7))).then((n) => ({
          key: 'week',
          icon: <Icons.sparkle />,
          value: n,
          label: 'نُشر لي هذا الأسبوع',
          hint: 'آخر 7 أيام',
          href: `${posts}?where[_status][equals]=published${mine}&sort=-publishedAt`,
          tone: 'calm',
        })),
        count(publishedWhere(user)).then((n) => ({
          key: 'all',
          icon: <Icons.check />,
          value: n,
          label: 'مقال منشور لي',
          hint: 'على الموقع الآن',
          href: `${posts}?where[_status][equals]=published${mine}`,
          tone: 'calm',
        })),
      ])

  return (
    <div className="lf-stats" dir="rtl">
      {tiles.map((t) => (
        <a key={t.key} className={`lf-stat lf-stat--${t.tone}`} href={t.href}>
          <span className="lf-stat__icon">{t.icon}</span>
          <span className="lf-stat__body">
            <strong className="lf-stat__value">{t.value}</strong>
            <span className="lf-stat__label">{t.label}</span>
            <span className="lf-stat__hint">{t.hint}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
