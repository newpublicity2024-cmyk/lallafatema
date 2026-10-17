import type { CollectionConfig } from 'payload'

import { anyone, hiddenFromJournalists, isAdminOrEditor } from '../access'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

/**
 * The Lalla Fatema YouTube channel, mirrored into the database by the `/sync-youtube` cron.
 *
 * WHY MIRROR AT ALL, instead of calling YouTube while rendering the homepage:
 *
 *   1. The homepage must not depend on a third party being up. A rendered page that calls
 *      YouTube has a YouTube outage as a homepage outage, and an ISR revalidation that
 *      happens to land during a blip bakes an empty band into the cache for an hour.
 *   2. The /videos listing paginates. The public RSS feed carries only the latest 15
 *      videos and has no concept of a page, so pagination has to come from our own store.
 *   3. Editors get a say. A channel is not an editorial calendar — an off-brand or
 *      duplicate upload can be hidden here without touching YouTube.
 *
 * NOTHING HERE IS HAND-AUTHORED. Every field except `hidden` is overwritten by the next
 * sync, which is why they are read-only in the admin UI: an editor who retitles a video
 * would otherwise watch their edit silently revert half an hour later. `hidden` is the one
 * editor-owned field, and `syncChannelVideos` is written to never touch it.
 *
 * No drafts and no `publishedAt` gate: a video is public on YouTube or it is not in the
 * feed at all, so a second publication state here would only be able to disagree with
 * reality.
 */
export const YoutubeVideos: CollectionConfig = {
  slug: 'youtube-videos',
  labels: { singular: 'فيديو يوتيوب', plural: 'فيديوهات يوتيوب' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'isShort', 'hidden'],
    group: 'المحتوى',
    hidden: hiddenFromJournalists,
    description:
      'تُجلب تلقائيًا من قناة لالة فاطمة على يوتيوب. الحقول للقراءة فقط — ' +
      'يمكن فقط إخفاء فيديو من الموقع.',
  },
  access: {
    // Public: the band and the listing are rendered for anonymous readers.
    read: anyone,
    // Writes belong to the sync, which runs with `overrideAccess`. Leaving create/update
    // open to editors would invite hand-edits that the next cron tick silently reverts.
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    {
      name: 'videoId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'معرّف الفيديو',
      admin: {
        readOnly: true,
        description: 'المعرّف على يوتيوب. هو مفتاح المزامنة، فلا يُعدَّل.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'العنوان',
      admin: { readOnly: true },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'الوصف',
      admin: { readOnly: true },
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      label: 'تاريخ النشر على يوتيوب',
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'thumbnailUrl',
      type: 'text',
      required: true,
      label: 'الصورة المصغّرة',
      admin: {
        readOnly: true,
        description: 'تُبنى من معرّف الفيديو، ولا تُؤخذ من محتوى التغذية.',
      },
    },
    {
      name: 'isShort',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'فيديو قصير (Short)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'الفيديوهات القصيرة عمودية ولا تظهر في شريط الفيديو ولا في صفحة الفيديو.',
      },
    },
    {
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'إخفاء من الموقع',
      admin: {
        position: 'sidebar',
        description:
          'الحقل الوحيد الذي يملكه المحرّر: يُخفي الفيديو من الموقع دون حذفه من يوتيوب، ' +
          'ولا تُلغيه المزامنة التالية.',
      },
    },
    {
      name: 'durationSeconds',
      type: 'number',
      label: 'المدة (بالثواني)',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'متاحة فقط عند استخدام مفتاح YouTube Data API.',
      },
    },
    {
      name: 'views',
      type: 'number',
      label: 'عدد المشاهدات',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'channelId',
      type: 'text',
      required: true,
      index: true,
      label: 'معرّف القناة',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'syncedAt',
      type: 'date',
      label: 'آخر مزامنة',
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
}
