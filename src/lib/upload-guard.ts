/**
 * Upload validation for the Media collection: an allowlist of raster image types + PDF
 * (SVG deliberately excluded — it can carry <script> and become stored XSS), with per-type
 * size caps. Pure so it is unit-testable without a DB or HTTP layer; wired into Media via a
 * beforeValidate hook, and backstopped by a global busboy fileSize limit in payload.config.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
] as const

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_PDF_BYTES = 40 * 1024 * 1024 // 40 MB

/**
 * Constraints embedded into the signed client-upload token (clientUploads: true).
 * Vercel Blob enforces these AT UPLOAD TIME, so an authenticated user cannot push
 * an arbitrary file type — or anything over the outer cap — straight into storage
 * through the signing route. Per-type caps (10MB images vs 40MB PDF) cannot be
 * expressed in a token; those are enforced at doc-create by `enforceUploadGuard`.
 */
export function clientUploadTokenConstraints(): {
  allowedContentTypes: string[]
  maximumSizeInBytes: number
} {
  return {
    allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
    maximumSizeInBytes: MAX_PDF_BYTES,
  }
}

/**
 * Returns `true` when the file is acceptable, or an Arabic error message describing why it
 * was rejected. Callers throw when a string comes back.
 */
export function validateUpload(file: { mimeType?: string | null; size?: number | null }): true | string {
  const mimeType = file.mimeType ?? ''
  const size = file.size ?? 0

  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'نوع الملف غير مسموح به. الأنواع المقبولة: JPEG، PNG، WebP، AVIF، GIF، وPDF.'
  }

  const cap = mimeType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (size > cap) {
    const mb = Math.floor(cap / (1024 * 1024))
    return `حجم الملف يتجاوز الحد الأقصى المسموح به (${mb} ميغابايت).`
  }

  return true
}
