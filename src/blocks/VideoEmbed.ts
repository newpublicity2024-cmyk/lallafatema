import type { Block } from 'payload'

/**
 * A video placed between paragraphs. Stored inside the rich-text JSON column,
 * so adding it needs no database migration.
 *
 * Rendered by `src/components/RichTextBody.tsx` through the same VideoPlayer
 * facade the header video uses (thumbnail + click-to-load iframe, CWV-safe).
 */
export const VideoEmbedBlock: Block = {
  slug: 'videoEmbed',
  labels: { singular: 'فيديو', plural: 'فيديوهات' },
  fields: [
    {
      name: 'url',
      type: 'text',
      label: 'رابط الفيديو',
      required: true,
      admin: {
        description: 'ألصق رابط يوتيوب أو فيميو.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return 'رابط الفيديو مطلوب.'
        try {
          new URL(value)
          return true
        } catch {
          return 'هذا لا يبدو رابطًا صحيحًا. انسخ الرابط كاملًا من شريط العنوان.'
        }
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'تعليق (اختياري)',
    },
  ],
}
