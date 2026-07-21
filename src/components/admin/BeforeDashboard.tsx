import type { ServerProps, Where } from 'payload'

import type { Post, User } from '@/payload-types'

/**
 * Custom RTL landing panel shown above the default Payload dashboard. Styled to
 * feel like the WordPress dashboard: an "At a Glance" stat strip, a prominent
 * write-article action, quick-create + shortcut pills, and a per-role "my drafts"
 * list (journalists see only their own; editors/admins see the newsroom's).
 *
 * Rendered server-side by Payload, so it can read `payload` + `user` directly.
 */
export default async function BeforeDashboard(props: ServerProps) {
  const { payload, user: rawUser } = props
  const user = rawUser as User | undefined
  if (!payload || !user) return null

  const isJournalist = user.role === 'journalist'

  // Draft filter — journalists see only their own; editors/admins see all.
  const draftWhere: Where = isJournalist
    ? { and: [{ _status: { equals: 'draft' } }, { authors: { in: [user.id] } }] }
    : { _status: { equals: 'draft' } }

  // "At a Glance" counts + recent drafts, gathered in parallel. `count` is cheap
  // (COUNT(*) with the same access rules the collection already enforces).
  const [publishedCount, draftCount, categoryCount, mediaCount, recentDrafts] = await Promise.all([
    payload.count({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      user,
      overrideAccess: false,
    }),
    payload.count({ collection: 'posts', where: draftWhere, user, overrideAccess: false }),
    payload.count({ collection: 'categories', user, overrideAccess: false }),
    payload.count({ collection: 'media', user, overrideAccess: false }),
    payload.find({
      collection: 'posts',
      where: draftWhere,
      sort: '-updatedAt',
      limit: 6,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ])

  const drafts = recentDrafts.docs as Post[]

  const stats = [
    { icon: '📝', label: 'مقالات منشورة', value: publishedCount.totalDocs, href: '/admin/collections/posts?where[_status][equals]=published' },
    { icon: '✏️', label: isJournalist ? 'مسوّداتي' : 'مسوّدات', value: draftCount.totalDocs, href: '/admin/collections/posts?where[_status][equals]=draft' },
    { icon: '🗂️', label: 'الأقسام', value: categoryCount.totalDocs, href: '/admin/collections/categories' },
    { icon: '🖼️', label: 'الوسائط', value: mediaCount.totalDocs, href: '/admin/collections/media' },
  ]

  const quickCreate = [
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
          background: 'var(--theme-elevation-0)',
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: '10px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem' }}>أهلًا، {user.name || user.email} 👋</h2>
            <p style={{ margin: 0, color: 'var(--theme-elevation-500)' }}>
              {isJournalist ? 'مرحبًا بك في لوحة التحرير.' : 'لوحة التحكم في مجلة لالة فاطمة.'}
            </p>
          </div>
          {/* Hard navigation is correct here: this is a Payload admin route, not
              a Next app page, and Payload's own nav uses anchors. next/link would
              attempt client-side routing the admin catch-all doesn't own. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/collections/posts/create" style={primaryButtonStyle}>
            ✍️ اكتب مقالًا جديدًا
          </a>
        </div>

        {/* At a Glance */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginTop: '1.25rem',
          }}
        >
          {stats.map((s) => (
            <a key={s.label} href={s.href} style={statTileStyle}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{s.icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '1.5rem', lineHeight: 1.1, color: 'var(--theme-text)' }}>
                  {s.value}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--theme-elevation-500)' }}>{s.label}</span>
              </span>
            </a>
          ))}
        </div>

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

        <Section title={isJournalist ? 'أحدث مسوّداتي' : 'أحدث المسوّدات'}>
          {drafts.length === 0 ? (
            <span style={{ color: 'var(--theme-elevation-500)' }}>لا توجد مسوّدات حاليًا.</span>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%' }}>
              {drafts.map((d) => (
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

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.6rem 1.15rem',
  borderRadius: '6px',
  fontSize: '0.9rem',
  fontWeight: 600,
  textDecoration: 'none',
  background: '#bc0168',
  color: '#fff',
  border: '1px solid #bc0168',
  whiteSpace: 'nowrap',
}

const statTileStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.7rem',
  padding: '0.9rem 1rem',
  borderRadius: '8px',
  textDecoration: 'none',
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-100)',
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
        background: primary ? '#bc0168' : 'var(--theme-elevation-100)',
        color: primary ? '#fff' : 'var(--theme-text)',
        border: primary ? '1px solid #bc0168' : '1px solid var(--theme-elevation-150)',
      }}
    >
      {label}
    </a>
  )
}
