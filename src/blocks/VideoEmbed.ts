import type { Block } from 'payload'

import { isEmbeddable } from '../lib/embeds'

/**
 * A video placed between paragraphs. Stored inside the rich-text JSON column,
 * so adding it needs no database migration.
 *
 * Rendered by `src/components/RichTextBody.tsx` through the same VideoPlayer
 * facade the header video uses (thumbnail + click-to-load iframe, CWV-safe).
 *
 * BACKWARD COMPATIBILITY IS LOAD-BEARING HERE. `slug`, `interfaceName` and both field
 * names (`url`, `caption`) are an on-disk contract: they are what already-stored article
 * JSON and every post *version* carry. Renaming any of them would leave those nodes
 * pointing at a block type the editor no longer knows, which Payload renders as an
 * unrecoverable "unknown block". The block may only ever be extended by ADDITION — which
 * is what the preview field below is.
 */
export const VideoEmbedBlock: Block = {
  slug: 'videoEmbed',
  // Emits a `VideoEmbedBlock` interface in payload-types so the frontend
  // converter can use the generated type instead of a hand-kept mirror.
  // Type-generation only — no schema impact.
  interfaceName: 'VideoEmbedBlock',
  labels: { singular: 'فيديو', plural: 'فيديوهات' },
  fields: [
    {
      name: 'url',
      type: 'text',
      label: 'رابط الفيديو',
      required: true,
      admin: {
        description:
          'ألصق رابطًا من يوتيوب، فيميو، ديلي موشن، فيسبوك (فيديو/ريل/منشور)، إنستغرام (منشور/ريل) أو تيك توك.',
      },
      /**
       * WHY this is not `new URL(value)`.
       *
       * The previous validator accepted anything `new URL()` could parse, and `new URL()`
       * succeeds for EVERY scheme — `javascript:alert(1)`, `data:text/html,<script>…` and
       * `file:///etc/passwd` all parse cleanly. A value that passes validation is stored,
       * and a stored value is later rendered into an `href`/`src` on a public page, so
       * that check was an open door to stored XSS reachable by any editor role. (Measured
       * before the fix: 0 of 1,554 live posts carried a bad scheme, so there was nothing
       * to migrate — the hole had simply never been walked through.)
       *
       * It also accepted hosts nobody can embed, so an editor only discovered that their
       * Dailymotion link was unsupported after publishing, when the article showed a bare
       * off-site link where the video should be.
       *
       * Both problems have one answer: ask the renderer's own parser. `isEmbeddable`
       * delegates to `parseEmbed`, which is the single place that knows the https-only
       * rule, the exact-dot-boundary host allowlist and the per-provider id charsets.
       * Validation and rendering therefore cannot disagree: if this field accepts a URL,
       * `MediaEmbed` can build a player for it, and if it refuses one, nothing is stored
       * that the renderer would have to degrade.
       */
      validate: (value: string | null | undefined): string | true => {
        if (typeof value !== 'string' || value.trim() === '') {
          return 'رابط الفيديو مطلوب.'
        }
        if (!isEmbeddable(value)) {
          return 'هذا الرابط غير مدعوم. استخدم رابطًا من يوتيوب، فيميو، ديلي موشن، فيسبوك، إنستغرام أو تيك توك، وانسخه كاملًا من شريط العنوان بحيث يبدأ بـ https.'
        }
        return true
      },
    },
    {
      // Pure presentation: a `ui` field stores nothing, so adding it changes neither the
      // stored JSON nor the generated `VideoEmbedBlock` interface — it only gives the
      // journalist the one thing the old field never did: proof, before saving, that the
      // link they pasted is the video they meant. Same pattern the post form already uses
      // for `writerGuide` / `publishChecklist` in `src/collections/Posts.ts`.
      name: 'urlPreview',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/editor/VideoEmbedPreview#default' },
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'تعليق (اختياري)',
      // Deliberately NOT required: legacy rows were saved without one, and making it
      // required would make every one of them unsaveable on the next edit.
    },
  ],
}
