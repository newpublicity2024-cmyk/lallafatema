/**
 * Custom next/image loader — THE #1 RULE.
 *
 * `next.config` sets `images.loader: 'custom'` so Next NEVER routes images
 * through Vercel's `/_next/image` optimizer (which 402s on a media-heavy site).
 * Resizing happens at Cloudflare's edge via Image Transformations:
 *   https://<host>/cdn-cgi/image/<options>/<source-url>
 *
 * When NEXT_PUBLIC_IMAGE_HOST is not configured (local dev, before R2/Cloudflare
 * are provisioned) we return the source URL unchanged — still bypassing Vercel,
 * just without edge resizing.
 */
type LoaderArgs = {
  src: string
  width: number
  quality?: number
}

const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST

export default function cloudflareImageLoader({ src, width, quality }: LoaderArgs): string {
  if (!IMAGE_HOST) return src

  // Cloudflare expects an absolute source URL or a path on its own zone.
  const source = src.startsWith('http') ? src : src.replace(/^\//, '')
  const options = `width=${width},quality=${quality || 75},format=auto`
  return `${IMAGE_HOST.replace(/\/$/, '')}/cdn-cgi/image/${options}/${source}`
}
