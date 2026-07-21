import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

import type { VideoEmbedBlock } from '@/payload-types'
import { youtubeThumbnailUrl } from '@/lib/video'
import { VideoPlayer } from './VideoPlayer'

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  blocks: {
    videoEmbed: ({ node }: { node: { fields: VideoEmbedBlock } }) => {
      const { url, caption } = node.fields
      if (!url) return null

      const title = caption || 'فيديو'

      return (
        <figure className="my-6">
          <VideoPlayer
            videoUrl={url}
            thumbnail={null}
            title={title}
            fallbackPosterUrl={youtubeThumbnailUrl(url) ?? undefined}
          />
          {caption ? (
            <figcaption className="mt-2 text-sm text-brand-700">{caption}</figcaption>
          ) : null}
        </figure>
      )
    },
  },
})

/**
 * The article/page body renderer. Wraps Payload's RichText with the converters
 * for our own Lexical blocks, so a writer can drop a video between paragraphs
 * and it renders with the same click-to-load facade as a header video.
 */
export function RichTextBody({ data, className }: { data: unknown; className?: string }) {
  return <RichText data={data as never} className={className} converters={converters} />
}
