'use client'

import { useAuth } from '@payloadcms/ui'

/**
 * A two-sentence orientation for journalists, shown at the top of the post form.
 * Editors and admins already know the system and get their screen back untouched.
 */
export default function WriterGuide() {
  const { user } = useAuth()

  if (!user || user.role === 'admin' || user.role === 'editor') return null

  return (
    <div
      dir="rtl"
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '.5rem',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        lineHeight: 1.9,
      }}
    >
      <strong style={{ display: 'block', marginBottom: '.35rem' }}>ابدأ بالكتابة مباشرة</strong>
      <span>
        اكتب العنوان ثم المقال، واختر القسم من الجانب. الرابط والمقتطف وتاريخ النشر وبيانات محركات
        البحث كلها تُضبط تلقائيًا. عملك يُحفظ أولًا بأول، ويصل إلى المحرّر لمراجعته ونشره.
      </span>
    </div>
  )
}
