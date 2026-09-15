import type { CollectionConfig } from 'payload'

import { anyone, hiddenFromJournalists, isAdminOrEditor, isAuthenticated } from '../access'
import { slugField } from '../fields/slug'

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'وسم', plural: 'الوسوم' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
    group: 'التصنيف',
    hidden: hiddenFromJournalists,
    hideAPIURL: true,
  },
  access: {
    read: anyone,
    create: isAuthenticated,
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
    slugField('name'),
  ],
}
