import type { CollectionConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { slugField } from '../fields/slug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'قسم', plural: 'الأقسام' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'parent', 'slug'],
    group: 'التصنيف',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'الاسم',
      required: true,
    },
    {
      // Hierarchical: a category can have a parent category (e.g. شهيوات لالة فاطمة under مطبخ).
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      label: 'القسم الأب',
      admin: { position: 'sidebar' },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'الوصف',
    },
    slugField('name'),
  ],
}
