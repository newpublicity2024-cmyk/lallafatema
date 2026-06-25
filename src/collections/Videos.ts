import type { CollectionConfig } from 'payload'

import { canReadPublished, isAdminOrEditor, isAuthenticated } from '../access'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: { singular: 'فيديو', plural: 'الفيديوهات' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', '_status', 'publishedAt'],
    group: 'المحتوى',
  },
  access: {
    read: canReadPublished,
    create: isAuthenticated,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  versions: { drafts: true, maxPerDoc: 10 },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'العنوان',
      required: true,
    },
    {
      name: 'videoUrl',
      type: 'text',
      label: 'رابط الفيديو (YouTube/خارجي)',
      required: true,
      admin: { description: 'يُحمَّل الإطار فقط عند النقر (نمط الواجهة المؤجلة) لأداء أفضل.' },
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      label: 'الصورة المصغّرة',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'الوصف',
    },
    {
      name: 'duration',
      type: 'text',
      label: 'المدة',
      admin: { description: 'مثال: 04:32 (تُستخدم في بيانات VideoObject).' },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      label: 'القسم',
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'تاريخ النشر',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    slugField('title'),
    seoField,
  ],
}
