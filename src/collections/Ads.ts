import type { Access, CollectionConfig, Where } from 'payload'

import { isAdminOrEditor } from '../access'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

/**
 * Public ad read access. Anonymous visitors and journalists only ever receive ads
 * that are `active` AND currently inside their schedule window (start/end optional).
 * Admins and editors see every ad so they can manage drafts and expired campaigns.
 *
 * The date window is enforced as a `Where` constraint (not just at render time) so
 * the frontend `getActiveAds` query can never leak a paused/expired creative.
 */
const canReadActiveAds: Access = ({ req: { user } }) => {
  if (user?.role === 'admin' || user?.role === 'editor') return true
  const now = new Date().toISOString()
  return {
    and: [
      { active: { equals: true } },
      { or: [{ startDate: { exists: false } }, { startDate: { less_than_equal: now } }] },
      { or: [{ endDate: { exists: false } }, { endDate: { greater_than_equal: now } }] },
    ],
  } as Where
}

// Only placements that actually render a slot in the layout are offered. `sidebar`
// and `popup` were dropped: the current design has no rail/popup slot, so scheduling
// one would silently never display. Re-add here (and wire an <AdSlot>) if that changes.
const PLACEMENT_OPTIONS = [
  { label: 'الترويسة / بانر علوي', value: 'header' },
  { label: 'داخل المقال', value: 'in-article' },
  { label: 'بين الأقسام', value: 'between-sections' },
  { label: 'التذييل', value: 'footer' },
]

/**
 * Ads — the only commercial surface, managed entirely from the dashboard. Supports
 * two creative kinds:
 *   - `image`  : a self-served creative I upload + a click-through target URL.
 *   - `script` : an ad-network unit (AdSense, etc.). The site-wide network loader
 *                lives once in Site Settings (`headScripts`); the per-unit markup
 *                that sits AT the slot lives here in `bodyScript`, with an optional
 *                per-ad `headScript` for units that need extra head JS.
 *
 * Raw markup in the script fields is rendered verbatim by `<AdSlot>` — this is a
 * deliberate, documented XSS surface that is safe only because authoring is locked
 * to admin/editor (see access below).
 */
export const Ads: CollectionConfig = {
  slug: 'ads',
  labels: { singular: 'إعلان', plural: 'الإعلانات' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'placement', 'format', 'active', 'startDate', 'endDate'],
    group: 'الإعلانات',
    // Public read stays open (frontend API needs active ads), but ads are a
    // commercial surface — hide them from journalists' admin nav entirely.
    hidden: ({ user }) => user?.role === 'journalist',
  },
  access: {
    read: canReadActiveAds,
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
      name: 'title',
      type: 'text',
      label: 'الاسم الداخلي',
      required: true,
      admin: { description: 'اسم تعريفي للإدارة فقط، لا يظهر للزوّار.' },
    },
    {
      name: 'placement',
      type: 'select',
      label: 'الموضع',
      required: true,
      options: PLACEMENT_OPTIONS,
      admin: { description: 'مكان عرض الإعلان على الموقع.' },
    },
    {
      name: 'format',
      type: 'select',
      label: 'نوع الإعلان',
      required: true,
      defaultValue: 'image',
      options: [
        { label: 'صورة (إعلان مباشر)', value: 'image' },
        { label: 'سكربت (شبكة إعلانات مثل AdSense)', value: 'script' },
      ],
    },
    // --- format: image ---
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'صورة الإعلان',
      admin: { condition: (data) => data?.format === 'image' },
    },
    {
      name: 'targetUrl',
      type: 'text',
      label: 'رابط الوجهة',
      admin: {
        condition: (data) => data?.format === 'image',
        description: 'الرابط الذي يُفتح عند النقر على الإعلان.',
      },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'النص البديل للصورة',
      admin: {
        condition: (data) => data?.format === 'image',
        description: 'يصف الإعلان لقارئات الشاشة ومحركات البحث.',
      },
    },
    {
      name: 'newTab',
      type: 'checkbox',
      label: 'فتح في نافذة جديدة',
      defaultValue: true,
      admin: { condition: (data) => data?.format === 'image' },
    },
    // --- format: script ---
    {
      name: 'bodyScript',
      type: 'code',
      label: 'كود وحدة الإعلان (يُوضع في مكان الإعلان)',
      admin: {
        language: 'html',
        condition: (data) => data?.format === 'script',
        description:
          'الكود الذي يُحقن في مكان الإعلان نفسه، مثل <ins class="adsbygoogle">…</ins>. ' +
          'محمّل الشبكة الرئيسي (مثل adsbygoogle.js) يُضاف مرة واحدة في إعدادات الموقع.',
      },
    },
    {
      name: 'headScript',
      type: 'code',
      label: 'كود إضافي للرأس (اختياري)',
      admin: {
        language: 'html',
        condition: (data) => data?.format === 'script',
        description: 'كود JS إضافي لرأس الصفحة إذا تطلّبت هذه الوحدة ذلك. اتركه فارغًا في الغالب.',
      },
    },
    // --- sidebar: scheduling / targeting ---
    {
      name: 'active',
      type: 'checkbox',
      label: 'مُفعّل',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'priority',
      type: 'number',
      label: 'الأولوية',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'الأعلى رقمًا يظهر أولًا عند التناوب بين عدّة إعلانات في نفس الموضع.',
      },
    },
    {
      name: 'startDate',
      type: 'date',
      label: 'تاريخ البداية',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'اتركه فارغًا للبدء فورًا.',
      },
    },
    {
      name: 'endDate',
      type: 'date',
      label: 'تاريخ الانتهاء',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'اتركه فارغًا بلا تاريخ انتهاء.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      label: 'استهداف الأقسام (اختياري)',
      admin: {
        position: 'sidebar',
        description: 'اعرض الإعلان فقط في صفحات هذه الأقسام. اتركه فارغًا للعرض في كل مكان.',
      },
    },
  ],
}
