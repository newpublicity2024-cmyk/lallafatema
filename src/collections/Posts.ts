import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import {
  canModifyOwnPosts,
  canReadPosts,
  isAdminOrEditorFieldLevel,
  isAuthenticated,
} from '../access'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
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
    beforeChange: [
      ({ data, req, operation }) => {
        // Journalists may not publish — only admins/editors can.
        if (
          data?._status === 'published' &&
          req.user &&
          req.user.role !== 'admin' &&
          req.user.role !== 'editor'
        ) {
          throw new APIError('غير مسموح لك بنشر المقالات. يرجى تركها كمسودة لمراجعة المحرّر.', 403)
        }
        // Stamp the first publish date.
        if (data?._status === 'published' && !data.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }
        // Default authorship to the creating user.
        if (operation === 'create' && req.user && (!data.authors || data.authors.length === 0)) {
          data.authors = [req.user.id]
        }
        return data
      },
    ],
    afterChange: [revalidateAfterChange, searchIndexAfterChange],
    afterDelete: [revalidateAfterDelete, searchIndexAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'العنوان',
      required: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'المقتطف',
      admin: { description: 'ملخص قصير يظهر في البطاقات ونتائج البحث.' },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      label: 'الصورة البارزة',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'المحتوى',
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
      admin: { position: 'sidebar' },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: 'الكاتب/الكتّاب',
      defaultValue: ({ user }) => (user ? [user.id] : []),
      access: {
        // Journalists can't reassign authorship; editors/admins can.
        update: isAdminOrEditorFieldLevel,
      },
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'تاريخ النشر',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    slugField('title'),
    seoField,
  ],
}
