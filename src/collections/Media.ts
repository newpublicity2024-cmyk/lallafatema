import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { anyone, isAdminOrEditor, isAuthenticated } from '../access'
import { ALLOWED_UPLOAD_MIME_TYPES, validateUpload } from '../lib/upload-guard'

/**
 * Rejects disallowed / oversized uploads before they persist: runs the pure `validateUpload`
 * allowlist + per-type size caps and throws a 400 on failure.
 *
 * Two paths reach it:
 *  1. Server uploads — the multipart request carries the bytes and `req.file` exists.
 *     NOTE: `req.file` is Payload's own `File` type (data/mimetype/name/size/tempFilePath),
 *     not a Web File — it exposes `.mimetype`, not `.type`.
 *  2. Client uploads (clientUploads: true) — the file went browser → Blob directly and the
 *     create carries only DECLARED metadata (`data.mimeType`/`data.filesize`); `req.file`
 *     never exists. Found live: a 15.3MB image sailed past the 10MB cap through this path.
 *     Declared values are validated on CREATE only — updates may resubmit the stored
 *     mimeType/filesize unchanged, and legacy media that predates the caps must stay
 *     editable (alt-text fixes) without being retroactively rejected.
 *
 * A lying client could declare false metadata, but the declared mimeType is also what the
 * doc serves with — an SVG declared as image/jpeg is delivered as image/jpeg and never
 * executes in a document context, so the stored-XSS vector stays closed. The signing route
 * additionally has Blob enforce the allowlist + outer size cap at upload time
 * (see `constrainedClientUploadRoute` in payload.config.ts).
 *
 * Synchronous (only calls the pure guard and throws) so it is directly unit-testable.
 */
export const enforceUploadGuard: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  const file = req.file

  if (file) {
    // `file.size` is unreliable on client-upload creates: the fetch-back rebuilds
    // req.file with `size` copied from the admin's file JSON, which omits it —
    // and an undefined size must never read as "0 bytes, under every cap". The
    // buffer itself is authoritative; declared filesize is the last resort.
    const size =
      (typeof file.size === 'number' && file.size > 0 ? file.size : 0) ||
      file.data?.length ||
      Number(data?.filesize) ||
      0
    const result = validateUpload({ mimeType: file.mimetype, size })
    if (result !== true) {
      throw new APIError(result, 400)
    }
    return
  }

  // No file: either a metadata-only edit (nothing to check) or a client-upload
  // create, which declares the stored object's type and size in the doc data.
  if (operation === 'create' && data && (data.mimeType != null || data.filesize != null)) {
    const result = validateUpload({
      mimeType: data.mimeType as string | null | undefined,
      size: data.filesize as number | null | undefined,
    })
    if (result !== true) {
      throw new APIError(result, 400)
    }
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
