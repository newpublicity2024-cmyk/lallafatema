import type { GlobalConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { revalidateGlobalAfterChange } from '../hooks/revalidate'

/**
 * Homepage builder — the key admin power. Lets editors pin specific posts into
 * the hero and arrange per-category section blocks. Empty fields fall back to
 * "latest N" defaults, so the homepage is never hardcoded but always populated.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'الصفحة الرئيسية',
  admin: { group: 'الإعدادات' },
  access: { read: anyone, update: isAdminOrEditor },
  hooks: { afterChange: [revalidateGlobalAfterChange] },
  fields: [
    {
      name: 'heroPosts',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      maxRows: 6,
      label: 'مقالات الواجهة',
      admin: {
        description: 'المقالات المثبّتة في أعلى الصفحة. اتركها فارغة لعرض أحدث المقالات تلقائيًا.',
      },
    },
    {
      name: 'featuredCategory',
      type: 'relationship',
      relationTo: 'categories',
      label: 'القسم المميّز (يُعرض ككتلة بارزة)',
      admin: {
        description:
          'القسم الذي يُعرض بتصميم القائمة البارزة (LeadListBlock) أسفل الواجهة. ' +
          'اتركه فارغًا لاستخدام القسم الأول تلقائيًا.',
      },
    },
    {
      name: 'videoBand',
      type: 'group',
      label: 'شريط الفيديو',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'إظهار شريط الفيديو',
          defaultValue: true,
        },
        {
          name: 'pinnedVideos',
          type: 'relationship',
          relationTo: 'videos',
          hasMany: true,
          label: 'فيديوهات مثبّتة (اختياري)',
          admin: { description: 'اتركها فارغة لعرض أحدث الفيديوهات تلقائيًا.' },
        },
      ],
    },
    {
      name: 'ads',
      type: 'group',
      label: 'إعلانات الصفحة الرئيسية',
      fields: [
        {
          name: 'betweenSections',
          type: 'checkbox',
          label: 'إظهار إعلان بين الأقسام',
          defaultValue: true,
        },
      ],
    },
    {
      name: 'sections',
      type: 'array',
      label: 'أقسام الصفحة',
      labels: { singular: 'قسم', plural: 'الأقسام' },
      admin: {
        description: 'رتّب الأقسام التي تظهر في الصفحة الرئيسية. اتركها فارغة لعرض كل الأقسام.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          required: true,
          label: 'القسم',
        },
        {
          name: 'titleOverride',
          type: 'text',
          label: 'عنوان مخصّص (اختياري)',
        },
        {
          name: 'limit',
          type: 'number',
          defaultValue: 4,
          min: 2,
          max: 8,
          label: 'عدد المقالات',
        },
        {
          name: 'pinnedPosts',
          type: 'relationship',
          relationTo: 'posts',
          hasMany: true,
          label: 'مقالات مثبّتة (اختياري)',
          admin: {
            description: 'اتركها فارغة لعرض أحدث المقالات في هذا القسم.',
          },
        },
      ],
    },
  ],
}
