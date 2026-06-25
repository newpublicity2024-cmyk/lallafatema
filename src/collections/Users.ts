import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminFieldLevel, isAdminOrSelf } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'مستخدم', plural: 'المستخدمون' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
    group: 'الإدارة',
  },
  auth: true,
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // The very first user is always an admin (bootstraps the system),
        // regardless of the role selected on the create-first-user screen.
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          if (totalDocs === 0) {
            return { ...data, role: 'admin' }
          }
        }
        return data
      },
    ],
  },
  access: {
    create: isAdmin,
    read: ({ req: { user } }) => Boolean(user),
    update: isAdminOrSelf,
    delete: isAdmin,
    admin: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'الاسم',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      label: 'الدور',
      required: true,
      defaultValue: 'journalist',
      access: {
        // Only admins may grant/change roles (prevents privilege escalation).
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      options: [
        { label: 'مدير (Admin)', value: 'admin' },
        { label: 'محرّر (Editor)', value: 'editor' },
        { label: 'صحفي (Journalist)', value: 'journalist' },
      ],
    },
    // Author profile — surfaced on public author pages (E-E-A-T, important for Health/YMYL).
    {
      name: 'bio',
      type: 'textarea',
      label: 'نبذة تعريفية',
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: 'الصورة الشخصية',
    },
    {
      name: 'title',
      type: 'text',
      label: 'المسمى الوظيفي',
    },
    {
      name: 'social',
      type: 'group',
      label: 'روابط التواصل',
      fields: [
        { name: 'facebook', type: 'text' },
        { name: 'x', type: 'text', label: 'X (Twitter)' },
        { name: 'instagram', type: 'text' },
        { name: 'youtube', type: 'text' },
        { name: 'tiktok', type: 'text', label: 'TikTok' },
      ],
    },
  ],
}
