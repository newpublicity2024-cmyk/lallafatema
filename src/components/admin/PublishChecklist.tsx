'use client'

import { useAuth, useFormFields } from '@payloadcms/ui'

import { lexicalToPlainText, type LexicalRoot } from '../../lib/lexical-text'

const Row = ({ done, label }: { done: boolean; label: string }) => (
  <li style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.15rem 0' }}>
    <span aria-hidden style={{ opacity: done ? 1 : 0.35 }}>
      {done ? '✅' : '⬜'}
    </span>
    <span style={{ opacity: done ? 1 : 0.7 }}>{label}</span>
    <span className="sr-only">{done ? '(مكتمل)' : '(غير مكتمل)'}</span>
  </li>
)

/**
 * Advisory only — it mirrors what the writer still has to do. Real enforcement
 * lives in field validation and the journalist publish-lock in postDefaults.
 */
export default function PublishChecklist() {
  const { user } = useAuth()

  const [title, category, featuredImage, content] = useFormFields(([fields]) => [
    fields?.title?.value,
    fields?.category?.value,
    fields?.featuredImage?.value,
    fields?.content?.value,
  ])

  if (!user || user.role === 'admin' || user.role === 'editor') return null

  const hasContent = lexicalToPlainText(content as LexicalRoot).length > 0

  return (
    <div dir="rtl" style={{ marginBottom: '1rem' }}>
      <strong style={{ display: 'block', marginBottom: '.4rem' }}>قبل الإرسال للمراجعة</strong>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <Row done={Boolean(title)} label="العنوان" />
        <Row done={Boolean(category)} label="القسم" />
        <Row done={Boolean(featuredImage)} label="صورة الغلاف" />
        <Row done={hasContent} label="نص المقال" />
      </ul>
    </div>
  )
}
