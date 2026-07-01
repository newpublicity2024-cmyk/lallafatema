import type { GlobalConfig } from 'payload'

import { anyone, isAdmin } from '../access'
import { revalidateGlobalAfterChange } from '../hooks/revalidate'

/**
 * Site Settings — the editable home for what used to be hardcoded in
 * `src/lib/site.ts` (branding, social, footer links, NewPub cross-links) plus the
 * site-wide script loaders the ad system needs.
 *
 * Reads are public (Header/Footer/layout consume it, each with the old constants
 * as a fallback so the site is never blank). Editing is admin-only — `headScripts`/
 * `bodyScripts` are injected verbatim into every page, a documented XSS surface that
 * is safe only because authoring is locked to admins.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'إعدادات الموقع',
  admin: {
    group: 'الإعدادات',
    // Public read (Header/Footer/layout consume it) but never expose the
    // site-wide script editor to journalists.
    hidden: ({ user }) => user?.role === 'journalist',
  },
  access: { read: anyone, update: isAdmin },
  hooks: { afterChange: [revalidateGlobalAfterChange] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'الهوية',
          fields: [
            { name: 'name', type: 'text', label: 'اسم الموقع' },
            { name: 'tagline', type: 'text', label: 'الشعار النصّي' },
            {
              name: 'logo',
              type: 'upload',
              relationTo: 'media',
              label: 'الشعار (صورة)',
            },
            {
              name: 'defaultOgImage',
              type: 'upload',
              relationTo: 'media',
              label: 'صورة المشاركة الافتراضية (OG)',
              admin: { description: 'تُستخدم عند مشاركة الصفحات التي لا تملك صورة OG خاصة.' },
            },
          ],
        },
        {
          label: 'التواصل الاجتماعي',
          fields: [
            {
              name: 'social',
              type: 'array',
              label: 'روابط التواصل',
              labels: { singular: 'رابط', plural: 'الروابط' },
              admin: { initCollapsed: true },
              fields: [
                {
                  name: 'platform',
                  type: 'select',
                  label: 'المنصّة',
                  required: true,
                  options: [
                    { label: 'فيسبوك', value: 'facebook' },
                    { label: 'إنستغرام', value: 'instagram' },
                    { label: 'إكس', value: 'x' },
                    { label: 'يوتيوب', value: 'youtube' },
                    { label: 'تيك توك', value: 'tiktok' },
                  ],
                },
                { name: 'url', type: 'text', label: 'الرابط', required: true },
              ],
            },
          ],
        },
        {
          label: 'التذييل',
          fields: [
            {
              name: 'footerPages',
              type: 'array',
              label: 'روابط الصفحات (التذييل)',
              labels: { singular: 'رابط', plural: 'الروابط' },
              admin: { initCollapsed: true },
              fields: [
                { name: 'label', type: 'text', label: 'النص', required: true },
                { name: 'href', type: 'text', label: 'الرابط', required: true },
              ],
            },
            {
              name: 'newpubLinks',
              type: 'array',
              label: 'روابط شبكة NewPub',
              labels: { singular: 'رابط', plural: 'الروابط' },
              admin: { initCollapsed: true },
              fields: [
                { name: 'label', type: 'text', label: 'النص', required: true },
                { name: 'href', type: 'text', label: 'الرابط', required: true },
              ],
            },
          ],
        },
        {
          label: 'السكربتات والتتبّع',
          description:
            'كود يُحقن في كل صفحات الموقع. يُحرّره المدير فقط. هنا يوضع محمّل شبكة الإعلانات ' +
            '(مثل adsbygoogle.js) ووسوم التحقق وأدوات التتبّع.',
          fields: [
            {
              name: 'headScripts',
              type: 'code',
              label: 'كود الرأس (<head>)',
              admin: {
                language: 'html',
                description:
                  'يُحقن مرة واحدة داخل <head> في كل الصفحات. مثال: محمّل AdSense، وسم التحقق، GTM (الجزء العلوي).',
              },
            },
            {
              name: 'bodyScripts',
              type: 'code',
              label: 'كود بداية الجسم (<body>)',
              admin: {
                language: 'html',
                description: 'يُحقن في بداية <body> في كل الصفحات. مثال: وسم GTM (noscript).',
              },
            },
            {
              name: 'analyticsId',
              type: 'text',
              label: 'معرّف التحليلات (اختياري)',
              admin: { description: 'مثال: G-XXXXXXX لـ Google Analytics 4.' },
            },
          ],
        },
        {
          label: 'الإعلانات',
          fields: [
            {
              name: 'adsEnabled',
              type: 'checkbox',
              label: 'تفعيل عرض الإعلانات في الموقع',
              defaultValue: true,
              admin: { description: 'مفتاح رئيسي لإيقاف كل الإعلانات مؤقتًا دون حذفها.' },
            },
          ],
        },
      ],
    },
  ],
}
