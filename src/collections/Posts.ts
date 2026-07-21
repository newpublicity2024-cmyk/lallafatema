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
      admin: {
        description:
          'اكتب المقال هنا. استخدم زر الصورة لإضافة صور، وزر الفيديو لإدراج مقطع بالرابط.',
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
      name: 'publishedAt',
      type: 'date',
      label: 'تاريخ النشر',
      admin: {
        position: 'sidebar',
        condition: editorialOnly,
        date: { pickerAppearance: 'dayAndTime' },
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
