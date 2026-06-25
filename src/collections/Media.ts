import type { CollectionConfig } from 'payload'

import { anyone, isAdminOrEditor, isAuthenticated } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'ملف وسائط', plural: 'مكتبة الوسائط' },
  admin: {
    group: 'المحتوى',
  },
  access: {
    read: anyone,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdminOrEditor,
  },
  upload: {
    // Image resizing is done at Cloudflare's edge (custom next/image loader),
    // NOT by Payload/Sharp variants and NEVER by Vercel. We keep the original only.
    // Focal point + alt are still useful metadata.
    focalPoint: true,
    crop: false,
    mimeTypes: ['image/*', 'application/pdf'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'النص البديل (Alt)',
      required: true,
      admin: {
        description: 'وصف موجز للصورة لأغراض الوصول وتحسين محركات البحث (إلزامي).',
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'التعليق',
    },
    {
      name: 'credit',
      type: 'text',
      label: 'حقوق/مصدر الصورة',
      admin: {
        description: 'مصدر الصورة أو صاحب الحقوق (مهم لصور المشاهير).',
      },
    },
  ],
}
