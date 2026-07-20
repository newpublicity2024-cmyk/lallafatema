import type { CollectionConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

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
  hooks: {
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
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
    // Reserve route segments AND the legal-page slugs — a category resolves before a
    // Page in the /[category] dispatcher, so a category slug of `about`/`privacy`/… would
    // silently shadow those pages.
    slugField('name', {
      reserved: true,
      reservedExtra: ['about', 'editorial-board', 'advertise', 'privacy', 'terms'],
    }),
    seoField,
  ],
}
