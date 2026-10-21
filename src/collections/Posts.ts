import type { CollectionConfig } from 'payload'

import {
  canModifyOwnPosts,
  canReadPosts,
  isAdminOrEditorFieldLevel,
  isAuthenticated,
} from '../access'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { editorialOnly } from '../fields/visibility'
import { validateArticleContent } from '../lib/lexical-text'
import { stripPastedAlignment } from '../hooks/lexicalAlign'
import { applyPostDefaults } from '../hooks/postDefaults'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { searchIndexAfterChange, searchIndexAfterDelete } from '../hooks/searchIndex'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'مقال', plural: 'المقالات' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'authors', '_status', 'publishedAt'],
    group: 'المحتوى',
    hideAPIURL: true,
    components: {
      // Thin wrapper over Payload's own button; kept as the single seam for any future
      // role rule on publishing. See the component.
      edit: { PublishButton: '/components/admin/PublishButton#default' },
    },
  },
  access: {
    read: canReadPosts,
    create: isAuthenticated,
    update: canModifyOwnPosts,
    delete: canModifyOwnPosts,
  },
  versions: {
    drafts: {
      autosave: { interval: 375 }, // powers live preview + autosave
    },
    maxPerDoc: 25,
  },
  hooks: {
    beforeChange: [applyPostDefaults],
    afterChange: [revalidateAfterChange, searchIndexAfterChange],
    afterDelete: [revalidateAfterDelete, searchIndexAfterDelete],
  },
  fields: [
    {
      name: 'writerGuide',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/WriterGuide#default' },
      },
    },
    {
      name: 'title',
      type: 'text',
      label: 'العنوان',
      required: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'المقتطف (اختياري)',
      admin: { description: 'اتركه فارغًا وسنكتبه تلقائيًا من بداية المقال.' },
    },
    {
      name: 'featuredType',
      type: 'select',
      label: 'نوع الوسائط البارزة',
      defaultValue: 'image',
      options: [
        { label: 'صورة', value: 'image' },
        { label: 'فيديو', value: 'video' },
      ],
      admin: {
        // Derived from featuredVideoUrl in applyPostDefaults — never chosen by hand.
        // Left visible to nobody: an editor picking a value the hook then
        // overwrites is worse than not offering the choice at all.
        hidden: true,
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      label: 'صورة الغلاف',
      admin: {
        description: 'الصورة الرئيسية التي تظهر أعلى المقال وفي قوائم الموقع.',
      },
    },
    {
      name: 'featuredVideoUrl',
      type: 'text',
      label: 'رابط فيديو الغلاف (اختياري)',
      admin: {
        // NO `condition` here. featuredType is derived FROM this field, so a
        // condition of `featuredType === 'video'` would be circular — the field
        // could only appear once a URL had been saved, which can never happen
        // while the field is hidden. Regression-guarded in editor-journalist.e2e.
        description:
          'ألصق رابط يوتيوب أو فيميو ليظهر الفيديو في أعلى المقال. اتركه فارغًا ليظهر الغلاف كصورة.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        try {
          new URL(value)
          return true
        } catch {
          return 'هذا لا يبدو رابطًا صحيحًا. انسخ الرابط كاملًا من شريط العنوان.'
        }
      },
    },
    {
      name: 'content',
      type: 'richText',
      label: 'نص المقال',
      validate: validateArticleContent,
      // Strips the paragraph alignment a Word paste brings with it — the editor has no
      // alignment control, so it is always residue, and Payload renders it with LTR
      // physics on an RTL page. See hooks/lexicalAlign.ts.
      hooks: { beforeChange: [stripPastedAlignment] },
      admin: {
        description:
          'اكتب المقال هنا. استخدم زر الصورة لإضافة صور، و«فيديو برابط» لإدراج مقطع من يوتيوب أو فيسبوك أو إنستغرام، و«فيديو من ملف» لرفع مقطع فيديو من جهازك (MP4 بحد أقصى ٢٠٠ ميغابايت).',
      },
    },
    // ── Recipe support (kitchen articles → Recipe structured data in Phase 4) ──
    {
      name: 'isRecipe',
      type: 'checkbox',
      label: 'هذا المقال وصفة طبخ',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'recipe',
      type: 'group',
      label: 'تفاصيل الوصفة',
      admin: { condition: (data) => Boolean(data?.isRecipe) },
      fields: [
        { name: 'prepTime', type: 'text', label: 'وقت التحضير', admin: { description: 'مثال: 20 دقيقة' } },
        { name: 'cookTime', type: 'text', label: 'وقت الطهي' },
        { name: 'servings', type: 'text', label: 'عدد الحصص' },
        { name: 'cuisine', type: 'text', label: 'المطبخ', admin: { description: 'مثال: مغربي' } },
        {
          name: 'ingredients',
          type: 'array',
          label: 'المكوّنات',
          fields: [{ name: 'item', type: 'text', label: 'مكوّن', required: true }],
        },
        {
          name: 'instructions',
          type: 'array',
          label: 'خطوات التحضير',
          fields: [{ name: 'step', type: 'textarea', label: 'خطوة', required: true }],
        },
      ],
    },
    // ── Sidebar: taxonomy, authorship, publishing ──
    {
      name: 'publishChecklist',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/admin/PublishChecklist#default' },
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      label: 'القسم',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      label: 'الوسوم',
      admin: { position: 'sidebar', condition: editorialOnly },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: 'الكاتب/الكتّاب',
      defaultValue: ({ user }) => (user ? [user.id] : []),
      access: {
        // Journalists can't reassign authorship; editors/admins can. The
        // condition below only hides it — this access control is what enforces it.
        update: isAdminOrEditorFieldLevel,
      },
      admin: { position: 'sidebar', condition: editorialOnly },
    },
    {
      // Read-out for the date field below: states, in words, whether this article is a
      // draft, programmed for a future moment, or live — with the moment in newsroom
      // time. Advisory only (like publishChecklist); it writes nothing.
      name: 'scheduleState',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/admin/SchedulePanel#default' },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'موعد النشر',
      admin: {
        position: 'sidebar',
        /*
         * VISIBLE TO EVERY ROLE, journalists included — this field IS the scheduling
         * control, and it used to carry `condition: editorialOnly`.
         *
         * Hiding it was right while scheduling was an editor's job: a journalist had no
         * reason to set a publish date and the picker was one more thing on their screen.
         * It is wrong now. A journalist who must put an article out at 14:00 needs this
         * field, and there is nothing to protect by hiding it — a future date makes the
         * article INVISIBLE to the public (src/lib/published-where.ts), so the worst a
         * mistake can do is delay their own story, which they can fix themselves.
         *
         * The fields around it keep their `editorialOnly` gate: tags, authors, slug and
         * SEO are still editorial decisions. `authors` additionally keeps its field-level
         * write lock — that one is a privilege boundary, not screen tidiness.
         *
         * Superseded contract: tests/e2e/editor-journalist.e2e.spec.ts asserted this field
         * was hidden from journalists. That assertion was replaced, not deleted.
         */
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'اتركه فارغًا لينشر المقال فور ضغطك على «نشر». أو اختر يومًا وساعة في المستقبل، واضغط «نشر»: سيبقى المقال مخفيًا عن الزوّار ثم يظهر وحده في الموعد المحدّد.',
      },
    },
    slugField('title'),
    seoField,
    {
      // Original WordPress post id — set only by the migration importer, so a re-run
      // updates the same post instead of duplicating it. Hidden; not editorially useful.
      name: 'legacyWpId',
      type: 'number',
      unique: true,
      index: true,
      admin: { hidden: true },
    },
  ],
}
