import { ALLOWED_UPLOAD_MIME_TYPES, validateUpload } from '../../../lib/upload-guard'

/**
 * Browser-side helper that turns dropped / pasted image files into Media documents.
 *
 * WHY it exists: the smart-paste editor plugin has to have real media IDs *before* it can
 * build a gallery block, and the only way to get one is to create the document. The admin
 * UI's own upload path is wired into the drawer flow (pick a file → fill the form → save),
 * which is exactly the friction the paste shortcut removes.
 *
 * WHY it posts to `/api/media` instead of reusing Payload's client-upload handler: the
 * client-upload path (`clientUploads: true`, Vercel Blob) is driven by the admin's upload
 * field component and needs its form context. A plain multipart POST goes through the
 * normal server create, which means `enforceUploadGuard` and Payload's own buffer sniff
 * both run on the real bytes — the stricter of the two paths. The trade-off is Vercel's
 * 4.5 MB request-body cap at the edge, so anything bigger is refused up front with an
 * Arabic message pointing at the image button (which does use the direct-to-Blob path)
 * rather than being sent and silently killed mid-flight.
 */

/** Vercel's serverless request-body ceiling, minus room for multipart overhead. */
const MAX_PASTED_BYTES = 4 * 1024 * 1024

export type UploadedMedia = {
  id: number | string
  /** The alt text the document was created with, reused as the gallery row's fallback. */
  alt: string
}

export type UploadOutcome = {
  created: UploadedMedia[]
  /** One Arabic sentence per file that could not be stored. Shown as a toast. */
  errors: string[]
}

/**
 * Image files only. PDFs are in the Media allowlist but a PDF in a photo gallery is never
 * what the journalist meant, and `image/svg+xml` is not in the allowlist at all (it can
 * carry a script — see `upload-guard.ts`).
 */
export function pickImageFiles(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer?.files?.length) return []
  const allowed = ALLOWED_UPLOAD_MIME_TYPES as readonly string[]
  return Array.from(dataTransfer.files).filter(
    (file) => file.type.startsWith('image/') && allowed.includes(file.type),
  )
}

/**
 * A human-readable alt from the file name, because `media.alt` is required and a journalist
 * who pasted eight photos will not stop to write eight descriptions mid-sentence.
 *
 * It is explicitly a PLACEHOLDER, not a claim about the image: camera file names
 * (`IMG_4821`) carry no meaning, so the gallery row's own `alt` field — which overrides
 * this one per article — is where the real description goes, and the block's field
 * description says so. Returning something non-empty is what keeps the create from
 * failing validation; returning the file's own name is what makes the placeholder
 * recognisable in the media library afterwards.
 */
export function altFromFileName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '')
  const cleaned = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned === '' ? 'صورة من المقال' : cleaned
}

/**
 * Uploads `files` sequentially and returns the documents that were created plus an Arabic
 * message for each one that failed.
 *
 * Sequential on purpose: a journalist pasting a dozen phone photos would otherwise open a
 * dozen concurrent multipart requests, and the first thing that breaks is the shared Neon
 * connection pool — a failure that looks like "the admin froze", not like "the upload was
 * rejected". One partial failure never aborts the rest: eight of nine photos in the
 * gallery is a better outcome than none.
 */
export async function uploadImageFiles(files: File[], apiBase: string): Promise<UploadOutcome> {
  const created: UploadedMedia[] = []
  const errors: string[] = []

  for (const file of files) {
    // Same guard the server runs, applied here so an oversized or wrong-typed file is
    // refused without a round trip and with the same wording the server would use.
    const guard = validateUpload({ mimeType: file.type, size: file.size })
    if (guard !== true) {
      errors.push(`«${file.name}»: ${guard}`)
      continue
    }
    if (file.size > MAX_PASTED_BYTES) {
      errors.push(
        `«${file.name}»: الصورة كبيرة على الإضافة باللصق (الحد ٤ ميغابايت). أضِفها بزر الصورة في شريط الأدوات.`,
      )
      continue
    }

    const alt = altFromFileName(file.name)
    const body = new FormData()
    body.append('file', file)
    // Payload's REST upload contract: the document's own data rides in `_payload` as JSON
    // alongside the binary part.
    body.append('_payload', JSON.stringify({ alt }))

    try {
      const response = await fetch(`${apiBase}/media`, {
        body,
        // The admin's auth cookie is what authorises the create (`create: isAuthenticated`).
        credentials: 'include',
        method: 'POST',
      })
      const json: unknown = await response.json().catch(() => null)
      const doc = (json as { doc?: { id?: number | string } } | null)?.doc

      if (!response.ok || doc?.id === undefined) {
        // Payload returns `{ errors: [{ message }] }`; its messages are already Arabic
        // when they come from the upload guard, so prefer them over our own wording.
        const serverMessage = (json as { errors?: { message?: string }[] } | null)?.errors?.[0]
          ?.message
        errors.push(`«${file.name}»: ${serverMessage || 'تعذّر رفع الصورة. حاول مرة أخرى.'}`)
        continue
      }

      created.push({ alt, id: doc.id })
    } catch {
      errors.push(`«${file.name}»: تعذّر الاتصال بالخادم أثناء رفع الصورة.`)
    }
  }

  return { created, errors }
}
