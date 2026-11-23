import type { CollectionConfig } from 'payload'

import { canReadPublished, hiddenFromJournalists, isAdminOrEditor } from '../access'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

export const MagazineIssues: CollectionConfig = {
  slug: 'magazine-issues',
  labels: { singular: 'عدد', plural: 'أعداد المجلة' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['issueNumber', 'title', 'publishDate', '_status'],
    group: 'المحتوى',
    description:
      'الأعداد المرقّمة من مجلة لالة فاطمة: غلاف + PDF، أو غلاف فقط للأعداد القديمة المؤرشفة.',
    hidden: hiddenFromJournalists,
    hideAPIURL: true,
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
      // Optional: the archived back-issues (1–147) exist only as cover images. An issue
      // without a PDF is shown in the archive as a cover that opens nothing. The column has
      // always been nullable (the collection has drafts), so this needs no migration.
      admin: {
        description:
          'اختياري. يُعرض داخل الصفحة مع زر للتحميل. بدونه يظهر العدد في الأرشيف بغلافه فقط.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'الوصف',
    },
  ],
}
