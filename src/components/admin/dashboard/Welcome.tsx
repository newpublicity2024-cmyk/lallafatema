import type { WidgetServerProps } from 'payload'

import type { User } from '@/payload-types'

import { ADMIN, firstNameOf, greeting, Icons, isEditorial, todayLabel } from './shared'

/**
 * Dashboard hero: greeting, today's date, and the one action a journalist
 * opens the admin for — writing. The heading keeps the literal "أهلًا" because
 * the e2e login helper asserts on it (tests/helpers/login.ts).
 */
export default function Welcome({ req }: WidgetServerProps) {
  const user = req.user as User | null
  if (!user) return null

  const editorial = isEditorial(user)

  return (
    <section className="lf-card lf-welcome" dir="rtl">
      <div className="lf-welcome__text">
        <p className="lf-welcome__date">{todayLabel()}</p>
        <h2 className="lf-welcome__title">
          أهلًا {firstNameOf(user)}، {greeting()}
        </h2>
        <p className="lf-welcome__sub">
          {editorial
            ? 'هنا تراجع المسوّدات، وتنشر، وترتّب ما يظهر على الموقع.'
            : 'اكتب مقالك هنا؛ يُحفظ تلقائيًا ويصل إلى المحرّر لمراجعته ونشره.'}
        </p>
      </div>
      <div className="lf-welcome__actions">
        <a className="lf-btn lf-btn--primary lf-btn--lg" href={`${ADMIN}/collections/posts/create`}>
          <Icons.pen />
          اكتب مقالًا جديدًا
        </a>
        <a
          className="lf-btn lf-btn--ghost lf-btn--lg"
          href={
            editorial
              ? `${ADMIN}/collections/posts`
              : `${ADMIN}/collections/posts?where[authors][in][0]=${user.id}`
          }
        >
          {editorial ? 'كل المقالات' : 'مقالاتي'}
        </a>
      </div>
    </section>
  )
}
