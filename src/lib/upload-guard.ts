/**
 * Upload validation for the Media collection: an allowlist of raster image types, PDF and
 * web-playable video (SVG deliberately excluded — it can carry <script> and become stored
 * XSS), with per-type size caps. Pure so it is unit-testable without a DB or HTTP layer;
 * wired into Media via a beforeValidate hook, and backstopped by a global busboy fileSize
 * limit in payload.config.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const

/**
 * The two containers every current browser plays from a bare `<video src>` without a
 * plugin, a transcoding service or a JS player.
 *
 * Deliberately NOT `video/quicktime` (.mov), which is what an iPhone hands you from the
 * share sheet: Safari plays it, Chrome and Firefox do not, and a file that plays for the
 * journalist who uploaded it and nobody else is the worst possible failure here — it is
 * invisible until a reader complains. Refusing it up front, with a message naming MP4, is
 * what keeps that from reaching an article. (The supplied clip is already MP4/h264/aac,
 * which is the combination with no caveats at all.)
 *
 * Exported because the video block's upload picker filters on exactly this list — the
 * admin must not offer a file the guard would then refuse.
 */
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

export const ALLOWED_UPLOAD_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf',
  ...ALLOWED_VIDEO_MIME_TYPES,
] as const

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_PDF_BYTES = 40 * 1024 * 1024 // 40 MB

/**
 * 200 MB for video.
 *
 * Sized from the real material rather than from a round number someone liked: the clip this
 * capability was built for is a ~72 MB, 6.5-minute 848x480 h264 export, which is what a
 * phone or a WhatsApp hand-off actually produces. A cap at 100 MB would clear that one file
 * and refuse the next slightly longer one, which is the shape of a limit that looks fine in
 * review and then fails on a Friday. 200 MB leaves the newsroom roughly a quarter-hour of
 * video at this bitrate.
 *
 * It is not a bandwidth policy. Nothing downloads a stored video until a reader presses
 * play (`preload="none"` plus a poster, see `components/embeds/VideoFile.tsx`), so the cost
 * of a large file is paid per play, not per page view.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB

const isVideo = (mimeType: string): boolean =>
  (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)

/** The per-type ceiling, in bytes, for a type already known to be on the allowlist. */
export function maxBytesFor(mimeType: string): number {
  if (mimeType === 'application/pdf') return MAX_PDF_BYTES
  if (isVideo(mimeType)) return MAX_VIDEO_BYTES
  return MAX_IMAGE_BYTES
}

/**
 * Returns `true` when the file is acceptable, or an Arabic error message describing why it
 * was rejected. Callers throw when a string comes back.
 */
export function validateUpload(file: { mimeType?: string | null; size?: number | null }): true | string {
  const mimeType = file.mimeType ?? ''
  const size = file.size ?? 0

  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'نوع الملف غير مسموح به. الأنواع المقبولة: JPEG، PNG، WebP، AVIF، GIF، PDF، وفيديو MP4 أو WebM.'
  }

  const cap = maxBytesFor(mimeType)
  if (size > cap) {
    const mb = Math.floor(cap / (1024 * 1024))
    return `حجم الملف يتجاوز الحد الأقصى المسموح به (${mb} ميغابايت).`
  }

  return true
}
