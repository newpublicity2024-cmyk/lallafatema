import type { CollectionConfig } from 'payload'

import { canReadPublished, isAdminOrEditor } from '../access'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

export const MagazineIssues: CollectionConfig = {
  slug: 'magazine-issues',
  labels: { singular: 'عدد', plural: 'أعداد المجلة' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['issueNumber', 'title', 'publishDate', '_status'],
    group: 'المحتوى',
    description: 'الأعداد الرقمية المرقّمة من مجلة لالة فاطمة (غلاف + PDF).',
  },
  access: {
    read: canReadPublished,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  versions: { drafts: true, maxPerDoc: 5 },
  hooks: {
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  defaultSort: '-issueNumber',
  fields: [
    {
      name: 'issueNumber',
      type: 'number',
      label: 'رقم العدد',
      required: true,
      unique: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'title',
      type: 'text',
      label: 'العنوان',
      admin: { description: 'مثال: العدد 167' },
    },
    {
      name: 'publishDate',
      type: 'date',
      label: 'تاريخ الإصدار',
      admin: { position: 'sidebar' },
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
      label: 'صورة الغلاف',
      required: true,
    },
    {
      name: 'pdf',
      type: 'upload',
      relationTo: 'media',
      label: 'ملف PDF',
      required: true,
      admin: { description: 'يُعرض داخل الصفحة مع زر للتحميل (يُخزَّن في R2).' },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'الوصف',
    },
  ],
}
