import type { CollectionConfig } from 'payload'

import { anyone, isAdminOrEditor } from '../access'
import { revalidateRedirects, revalidateRedirectsAfterDelete } from '../hooks/revalidate'

/**
 * Admin-editable 301/302 redirects — groundwork for the Phase 7 WordPress map.
 * Served at request time by `src/middleware.ts` via the cached `/redirects-map.json`
 * route. Exact-path matching only for now (wildcards/regex arrive in Phase 7).
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: 'إعادة توجيه', plural: 'إعادات التوجيه' },
  admin: {
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'type', 'active'],
    group: 'الإعدادات',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateRedirects],
    afterDelete: [revalidateRedirectsAfterDelete],
  },
  fields: [
    {
      name: 'from',
      type: 'text',
      label: 'من (المسار القديم)',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'المسار فقط، يبدأ بشرطة مائلة. مثال: /old-article-123' },
    },
    {
      name: 'to',
      type: 'text',
      label: 'إلى (الوجهة)',
      required: true,
      admin: { description: 'مسار داخلي (/new) أو رابط كامل.' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'النوع',
      defaultValue: '301',
      options: [
        { label: '301 (دائم)', value: '301' },
        { label: '302 (مؤقت)', value: '302' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'مُفعّل',
      defaultValue: true,
    },
  ],
}
