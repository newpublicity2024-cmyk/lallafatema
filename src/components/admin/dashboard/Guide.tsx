import type { WidgetServerProps } from 'payload'

import type { User } from '@/payload-types'

import { Card, Icons, isEditorial } from './shared'

/**
 * Three steps, in the writer's words. Editors get the review flow instead.
 * Advisory only — the real rules live in field validation + the publish lock.
 */
export default function Guide({ req }: WidgetServerProps) {
  const user = req.user as User | null
  if (!user) return null

  const steps = isEditorial(user)
    ? [
        { title: 'افتح المسوّدة', text: 'من قائمة «بانتظار المراجعة» أو من صفحة المقالات.' },
        { title: 'راجع وعدّل', text: 'العنوان والقسم وصورة الغلاف والنص. المعاينة تعرض المقال كما سيظهر.' },
        { title: 'انشر', text: 'زر «نشر التغييرات» أعلى الصفحة. يظهر المقال على الموقع فورًا.' },
      ]
    : [
        { title: 'اكتب', text: 'العنوان ثم نص المقال. يُحفظ تلقائيًا أثناء الكتابة، فلا حاجة لزر حفظ.' },
        { title: 'أضف صورة الغلاف واختر القسم', text: 'الصورة من حاسوبك أو من مكتبة الصور، والقسم من القائمة الجانبية.' },
        { title: 'اتركه للمحرّر', text: 'كل مسوّدة تصل إلى المحرّر ليراجعها وينشرها. لا يوجد زر إرسال.' },
      ]

  return (
    <Card title={isEditorial(user) ? 'المراجعة والنشر في 3 خطوات' : 'كيف أنشر مقالًا؟'} icon={<Icons.sparkle />}>
      <ol className="lf-steps">
        {steps.map((s, i) => (
          <li key={s.title} className="lf-step">
            <span className="lf-step__num">{i + 1}</span>
            <span className="lf-step__body">
              <strong className="lf-step__title">{s.title}</strong>
              <span className="lf-step__text">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
