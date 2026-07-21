import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { anyone, isAdminOrEditor, isAuthenticated } from '../access'
import { ALLOWED_UPLOAD_MIME_TYPES, validateUpload } from '../lib/upload-guard'

/**
 * Rejects disallowed / oversized uploads before they persist: runs the pure `validateUpload`
 * allowlist + per-type size caps against the request file and throws a 400 on failure.
 *
 * Synchronous (only calls the pure guard and throws) so it is directly unit-testable without a
 * DB or HTTP layer. NOTE: `req.file` is Payload's own `File` type
 * (data/mimetype/name/size/tempFilePath), not a Web File — it exposes `.mimetype`, not `.type`.
 */
export const enforceUploadGuard: CollectionBeforeValidateHook = ({ req }) => {
  const file = req.file
  // Metadata-only updates (e.g. editing alt text) carry no file — nothing to check.
  if (!file) return
  const result = validateUpload({ mimeType: file.mimetype, size: file.size })
  if (result !== true) {
    throw new APIError(result, 400)
  }
}

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
    beforeValidate: [enforceUploadGuard],
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
      label: 'ماذا تظهر الصورة؟',
      required: true,
      admin: {
        description: 'جملة قصيرة تصف الصورة. مثال: إطلالة الفنانة خلال حفل توزيع الجوائز بالرباط.',
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
