import type { Block } from 'payload'

import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES } from '../lib/upload-guard'

/**
 * A video FILE the newsroom owns, placed between paragraphs.
 *
 * The sibling of `videoEmbed`, and deliberately a separate block rather than a new mode on
 * it. `videoEmbed` takes a URL and hands the reader to YouTube/Instagram/TikTok through an
 * iframe facade; this one takes bytes out of our own media library and plays them from our
 * own object storage. They share a word in Arabic and nothing else: different stored shape,
 * different renderer, different privacy story, different failure modes. Folding both into
 * one block would mean a `url` that is required only sometimes — and `videoEmbed.url` is
 * `required: true` in 1,500+ posts' worth of version history, so relaxing it is exactly the
 * kind of change that makes an old row unsaveable on its next edit.
 *
 * Like the gallery, it lives inside the `content` JSONB column, so it ships with NO database
 * migration — which matters because dev and production share one Neon instance and the
 * adapter runs with `push: false`.
 *
 * `slug`, `interfaceName` and the field names below are an on-disk contract the moment the
 * first article is saved with one. Extend by ADDITION only.
 */
export const VideoFileBlock: Block = {
  slug: 'videoFile',
  // Emits a `VideoFileBlock` interface into payload-types so the public renderer uses the
  // generated type instead of a hand-kept mirror. Type generation only.
  interfaceName: 'VideoFileBlock',
  labels: { singular: 'فيديو من ملف', plural: 'فيديوهات من ملفات' },
  fields: [
    {
      name: 'video',
      type: 'upload',
      relationTo: 'media',
      label: 'ملف الفيديو',
      required: true,
      /**
       * The picker must not offer a file the upload guard would refuse, and must not offer
       * the 2,000-odd photos either — scrolling past them to find one video is how an
       * editor ends up attaching a JPEG to a video block.
       *
       * Built from the guard's own list so the two cannot drift: add a container there and
       * it becomes selectable here in the same commit.
       */
      filterOptions: { mimeType: { in: [...ALLOWED_VIDEO_MIME_TYPES] } },
      admin: {
        description:
          'ارفع ملف الفيديو (MP4 أو WebM، بحد أقصى ٢٠٠ ميغابايت) أو اختر واحدًا من مكتبة الوسائط.',
      },
    },
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      label: 'صورة الغلاف (اختياري)',
      filterOptions: { mimeType: { in: [...ALLOWED_IMAGE_MIME_TYPES] } },
      admin: {
        /**
         * Optional, but the single highest-value field in the block.
         *
         * With a poster the renderer ships `preload="none"`: the reader sees a real frame
         * and the article costs ZERO video bytes until they press play. Without one the
         * browser has to fetch the file's header to draw its first frame, so an article
         * with three videos opens three connections to object storage before anybody has
         * asked to watch anything. The description says this in newsroom terms rather than
         * leaving it as a performance footnote nobody reads.
         */
        description:
          'صورة تظهر مكان الفيديو قبل تشغيله. أضِفها دائمًا إن أمكن: بدونها يبدأ المتصفح بتحميل الفيديو حتى لو لم يشغّله القارئ.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: 'تعليق (اختياري)',
      admin: { description: 'يظهر تحت الفيديو.' },
    },
  ],
}
