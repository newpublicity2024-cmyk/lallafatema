import type { Field } from 'payload'

import { editorialOnly } from './visibility'

/**
 * Per-document SEO overrides. Phase 4 builds the full metadata/JSON-LD pipeline on
 * top of these; defaults (title/excerpt/featured image) are used when left blank.
 */
export const seoField: Field = {
  name: 'seo',
  type: 'group',
  label: 'تحسين محركات البحث (SEO)',
  admin: {
    // Journalists never see this: leaving the group blank already falls back to
    // title / excerpt / featured image, so hiding it costs nothing.
    condition: editorialOnly,
    description: 'اتركها فارغة لاستخدام العنوان والمقتطف والصورة البارزة افتراضيًا.',
  },
  fields: [
    {
      name: 'metaTitle',
      type: 'text',
      label: 'عنوان الميتا',
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      label: 'وصف الميتا',
    },
    {
      name: 'ogImage',
      type: 'upload',
      relationTo: 'media',
      label: 'صورة المشاركة (OG)',
    },
    {
      name: 'canonicalURL',
      type: 'text',
      label: 'الرابط الأساسي (Canonical)',
    },
    {
      name: 'noIndex',
      type: 'checkbox',
      label: 'منع الفهرسة (noindex)',
      defaultValue: false,
    },
  ],
}
