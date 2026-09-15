import type { WidgetServerProps } from 'payload'

import type { User } from '@/payload-types'

import { ADMIN, Icons } from './shared'

type Shortcut = {
  href: string
  icon: React.ReactNode
  label: string
  hint: string
  roles: Array<User['role']>
}

const ALL: Array<User['role']> = ['admin', 'editor', 'journalist']
const EDITORIAL: Array<User['role']> = ['admin', 'editor']

/**
 * Plain-language doors into the rest of the admin — what each thing is FOR,
 * not its collection name. Replaces Payload's group-by-group collection cards,
 * which read like a database schema to a non-technical journalist.
 */
const SHORTCUTS: Shortcut[] = [
  {
    href: `${ADMIN}/globals/homepage`,
    icon: <Icons.home />,
    label: 'الصفحة الرئيسية',
    hint: 'اختر ما يظهر في الواجهة وترتيبه',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/media`,
    icon: <Icons.image />,
    label: 'مكتبة الصور',
    hint: 'ارفع الصور وأعد استخدامها',
    roles: ALL,
  },
  {
    href: `${ADMIN}/collections/ads`,
    icon: <Icons.megaphone />,
    label: 'الإعلانات',
    hint: 'مواضع الإعلانات وجدولتها',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/categories`,
    icon: <Icons.folder />,
    label: 'الأقسام',
    hint: 'أقسام الموقع وترتيبها',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/tags`,
    icon: <Icons.tag />,
    label: 'الوسوم',
    hint: 'كلمات مفتاحية تربط المقالات',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/magazine-issues`,
    icon: <Icons.book />,
    label: 'أعداد المجلة',
    hint: 'الأعداد الورقية وملفات PDF',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/globals/main-menu`,
    icon: <Icons.menu />,
    label: 'القائمة الرئيسية',
    hint: 'روابط أعلى الموقع',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/pages`,
    icon: <Icons.page />,
    label: 'الصفحات الثابتة',
    hint: 'من نحن، اتصل بنا، السياسات…',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/users`,
    icon: <Icons.users />,
    label: 'الفريق',
    hint: 'الكتّاب والمحرّرون وصلاحياتهم',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/collections/redirects`,
    icon: <Icons.redirect />,
    label: 'إعادة التوجيه',
    hint: 'حوّل الروابط القديمة إلى الجديدة',
    roles: EDITORIAL,
  },
  {
    href: `${ADMIN}/globals/site-settings`,
    icon: <Icons.settings />,
    label: 'إعدادات الموقع',
    hint: 'الاسم والشعار والروابط الاجتماعية',
    roles: ['admin'],
  },
  {
    href: `${ADMIN}/account`,
    icon: <Icons.user />,
    label: 'حسابي',
    hint: 'اسمك، صورتك، وكلمة المرور',
    roles: ALL,
  },
]

export default function Shortcuts({ req }: WidgetServerProps) {
  const user = req.user as User | null
  if (!user) return null

  const items = SHORTCUTS.filter((s) => s.roles.includes(user.role))

  return (
    <section className="lf-shortcuts" dir="rtl" aria-label="اختصارات">
      {items.map((s) => (
        <a key={s.href} className="lf-shortcut" href={s.href}>
          <span className="lf-shortcut__icon">{s.icon}</span>
          <span className="lf-shortcut__text">
            <strong className="lf-shortcut__label">{s.label}</strong>
            <span className="lf-shortcut__hint">{s.hint}</span>
          </span>
        </a>
      ))}
    </section>
  )
}
