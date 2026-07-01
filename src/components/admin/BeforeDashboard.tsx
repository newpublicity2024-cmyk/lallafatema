import type { ServerProps } from 'payload'

import type { Post, User } from '@/payload-types'

/**
 * Custom RTL landing panel shown above the default Payload dashboard. Gives the
 * editorial team fast paths into the most common actions (create article / video /
 * ad), shortcuts to the curation surfaces, and a "my drafts" list — scoped per role
 * (journalists see only their own drafts; editors/admins see the newsroom's).
 *
 * Rendered server-side by Payload, so it can read `payload` + `user` directly.
 */
export default async function BeforeDashboard(props: ServerProps) {
  const { payload, user: rawUser } = props
  const user = rawUser as User | undefined
  if (!payload || !user) return null

  const isJournalist = user.role === 'journalist'

  // Recent drafts — journalists see only their own; editors/admins see all.
  const { docs: drafts } = await payload.find({
    collection: 'posts',
    where: isJournalist
      ? { and: [{ _status: { equals: 'draft' } }, { authors: { in: [user.id] } }] }
      : { _status: { equals: 'draft' } },
    sort: '-updatedAt',
    limit: 6,
    depth: 0,
    user,
    overrideAccess: false,
  })

  const quickCreate = [
    { label: 'مقال جديد', href: '/admin/collections/posts/create' },
    { label: 'فيديو جديد', href: '/admin/collections/videos/create' },
    ...(isJournalist ? [] : [{ label: 'إعلان جديد', href: '/admin/collections/ads/create' }]),
  ]

  const shortcuts = [
    { label: 'إدارة الصفحة الرئيسية', href: '/admin/globals/homepage' },
    { label: 'الوسائط', href: '/admin/collections/media' },
    ...(isJournalist
      ? []
      : [
          { label: 'الإعلانات', href: '/admin/collections/ads' },
          { label: 'إعدادات الموقع', href: '/admin/globals/site-settings' },
          { label: 'المستخدمون', href: '/admin/collections/users' },
        ]),
  ]

  return (
    <div dir="rtl" style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: '8px',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.25rem' }}>أهلًا، {user.name || user.email} 👋</h2>
        <p style={{ margin: 0, color: 'var(--theme-elevation-500)' }}>
          {isJournalist ? 'مرحبًا بك في لوحة التحرير.' : 'لوحة التحكم في مجلة لالة فاطمة.'}
        </p>

        <Section title="إنشاء سريع">
          {quickCreate.map((a) => (
            <PillLink key={a.href} href={a.href} label={a.label} primary />
          ))}
        </Section>

        <Section title="اختصارات">
          {shortcuts.map((a) => (
            <PillLink key={a.href} href={a.href} label={a.label} />
          ))}
        </Section>

        <Section title={isJournalist ? 'مسوّداتي' : 'أحدث المسوّدات'}>
          {drafts.length === 0 ? (
            <span style={{ color: 'var(--theme-elevation-500)' }}>لا توجد مسوّدات حاليًا.</span>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%' }}>
              {(drafts as Post[]).map((d) => (
                <li key={d.id} style={{ padding: '0.35rem 0' }}>
                  <a
                    href={`/admin/collections/posts/${d.id}`}
                    style={{ color: 'var(--theme-text)', textDecoration: 'none' }}
                  >
                    📝 {d.title || 'بدون عنوان'}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--theme-elevation-500)' }}>
        {title}
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>{children}</div>
    </div>
  )
}

function PillLink({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '0.4rem 0.9rem',
        borderRadius: '999px',
        fontSize: '0.85rem',
        textDecoration: 'none',
        background: primary ? 'var(--theme-success-500, #2e8b57)' : 'var(--theme-elevation-100)',
        color: primary ? '#fff' : 'var(--theme-text)',
        border: '1px solid var(--theme-elevation-150)',
      }}
    >
      {label}
    </a>
  )
}
