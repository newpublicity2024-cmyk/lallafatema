import type { CollectionConfig } from 'payload'

import { canReadPublished, isAdminOrEditor } from '../access'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

/**
 * Static editorial pages: About (من نحن), Editorial board (هيئة التحرير),
 * Advertise (للإعلان), Privacy / Terms / Cookies. Managed by editors/admins.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'صفحة', plural: 'الصفحات' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status'],
    group: 'المحتوى',
  },
  access: {
    read: canReadPublished,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  versions: { drafts: { autosave: { interval: 375 } }, maxPerDoc: 10 },
  hooks: {
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'العنوان',
      required: true,
    },
    {
      name: 'content',
      type: 'richText',
      label: 'المحتوى',
    },
    slugField('title'),
    seoField,
  ],
}
