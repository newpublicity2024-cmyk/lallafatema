import type { GlobalConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { revalidateGlobalAfterChange } from '../hooks/revalidate'

const linkFields = [
  { name: 'label', type: 'text' as const, label: 'النص', required: true },
  {
    name: 'category',
    type: 'relationship' as const,
    relationTo: 'categories' as const,
    label: 'القسم',
    admin: { description: 'اربط العنصر بقسم، أو استخدم رابطًا مخصّصًا أدناه.' },
  },
  { name: 'url', type: 'text' as const, label: 'رابط مخصّص (اختياري)' },
]

/**
 * Navigation / mega-menu builder. Editors define the header items and optional
 * sub-items (mega-menu). Empty → the Header falls back to all top-level categories.
 */
export const MainMenu: GlobalConfig = {
  slug: 'main-menu',
  label: 'القائمة الرئيسية',
  admin: { group: 'الإعدادات' },
  access: { read: anyone, update: isAdminOrEditor },
  hooks: { afterChange: [revalidateGlobalAfterChange] },
  fields: [
    {
      name: 'items',
      type: 'array',
      label: 'عناصر القائمة',
      labels: { singular: 'عنصر', plural: 'العناصر' },
      admin: { description: 'اتركها فارغة لعرض كل الأقسام تلقائيًا.', initCollapsed: true },
      fields: [
        ...linkFields,
        {
          name: 'children',
          type: 'array',
          label: 'القائمة الفرعية (ميغا)',
          labels: { singular: 'رابط فرعي', plural: 'روابط فرعية' },
          fields: linkFields,
        },
      ],
    },
  ],
}
