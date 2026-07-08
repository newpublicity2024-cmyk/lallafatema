import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { anyone, isAdminOrEditor, isAuthenticated } from '../access'
import { ALLOWED_UPLOAD_MIME_TYPES, validateUpload } from '../lib/upload-guard'

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
  hooks: {
    beforeValidate: [
      ({ req }) => {
        const file = req.file
        // Metadata-only updates (e.g. editing alt text) carry no file — nothing to check.
        if (!file) return
        // NOTE: req.file is Payload's own `File` type (data/mimetype/name/size/tempFilePath),
        // not a Web File — it exposes `.mimetype`, not `.type`.
        const result = validateUpload({ mimeType: file.mimetype, size: file.size })
        if (result !== true) {
          throw new APIError(result, 400)
        }
      },
    ],
  },
  upload: {
    // Image resizing is done at Cloudflare's edge (custom next/image loader),
    // NOT by Payload/Sharp variants and NEVER by Vercel. We keep the original only.
    // Focal point + alt are still useful metadata.
    focalPoint: true,
    crop: false,
    // Was `image/*` (allowed SVG). Now an explicit raster + PDF allowlist (see upload-guard).
    mimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
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
