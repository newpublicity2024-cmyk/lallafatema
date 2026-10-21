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
 *  2. Client uploads (clientUploads: true) — the file went browser → Blob directly, which in
 *     production is the ONLY way a large file arrives, because Vercel kills any request body
 *     over 4.5 MB at the edge. CORRECTED (verified against payload@3.85.1): `req.file` is NOT
 *     absent on this path. `addDataAndFileToRequest` re-fetches the stored object through the
 *     collection's static handler and rebuilds `req.file` with the real bytes
 *     (`Buffer.from(await response.arrayBuffer())`) and the Content-Type the store reports,
 *     so branch 1 above is normally what runs here too. An earlier version of this comment
 *     claimed otherwise and pointed at a `constrainedClientUploadRoute` in payload.config.ts
 *     that does not exist in this repository; both statements were wrong and are removed
 *     rather than left to be relied on. The historical finding stands: a 15.3MB image once
 *     sailed past the 10MB cap through this path.
 *
 *     The declared-metadata branch below remains for a create that carries no file at all. It
 *     validates on CREATE only — updates may resubmit the stored mimeType/filesize unchanged,
 *     and legacy media that predates the caps must stay editable (alt-text fixes) without
 *     being retroactively rejected.
 *
 * A lying client can still declare a false mimeType, but the declared mimeType is also what
 * the doc serves with — an SVG declared as image/jpeg is delivered as image/jpeg and never
 * executes in a document context, so the stored-XSS vector stays closed. SIZE is no longer
 * taken on trust at all; see the measurement below.
 *
 * Synchronous (only calls the pure guard and throws) so it is directly unit-testable.
 */
export const enforceUploadGuard: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  const file = req.file

  if (file) {
    /*
     * MEASURE THE BYTES. DO NOT ASK THE UPLOADER HOW MANY THERE ARE.
     *
     * This used to read `file.size` first, justified by the claim that the admin's
     * client-upload JSON omits it. It does not: `@payloadcms/ui`'s Form serialises
     * `{ clientUploadContext, collectionSlug, filename, mimeType, size: file.size }`, and
     * `addDataAndFileToRequest` copies that number straight onto `req.file.size`. So the
     * figure this cap was enforced against came from the client, on the one path by which a
     * large file can reach production at all. Measured before the change: a 12 MB PNG
     * declaring `size: 1` was ACCEPTED against the 10 MB cap. Raising the video ceiling to
     * 200 MB is what made that worth fixing rather than noting.
     *
     * `file.data` is not the uploader's to choose on either path — busboy fills it from the
     * request body, and the client-upload path fills it from the bytes Payload itself fetched
     * back out of storage. Its length IS the file. The declared values stay as fallbacks,
     * ordered after it, for the shapes where no buffer exists (a `useTempFiles` config, or a
     * create that carries metadata only); a zero-length buffer is falsy and falls through to
     * them rather than reading as "0 bytes, under every cap".
     */
    const size =
      file.data?.length ||
      (typeof file.size === 'number' && file.size > 0 ? file.size : 0) ||
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
    hideAPIURL: true,
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
