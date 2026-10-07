import type { Block } from 'payload'

/**
 * Photo gallery placed between paragraphs ("معرض صور" / Galerie).
 *
 * WHY a Lexical block and not a new collection field: the block lives inside the
 * `content` JSONB column, so it ships with **no database migration** — which matters
 * because dev and production currently share one Neon instance and the adapter runs
 * with `push: false` (see the db comment in `payload.config.ts`). A gallery is also
 * part of the article's flow, not metadata about it: the journalist decides where in
 * the text the photos interrupt the prose, and only an in-body block can express that.
 *
 * WHY the stored layout values are English while every label is Arabic: the spec this
 * block comes from was written for a French sister site ("Mosaïque / Grille /
 * Carrousel"). This admin is Arabic-first RTL (`i18n.fallbackLanguage: 'ar'`), so the
 * labels are authored in Arabic — but the *values* stay `mosaic` / `grid` / `carousel`
 * because they are an interface, consumed by the public renderer
 * (`src/components/gallery/Gallery.tsx`) and asserted by the audit gates. Translating a
 * stored value would mean translating a contract.
 *
 * Rendered on the public site by `RichTextBody` → `Gallery`, which caps `mosaic` at five
 * tiles and shows "+N" on the last one; `grid` and `carousel` never cap. Keep that in
 * mind when editing the option descriptions below — they are the only place a journalist
 * learns the difference.
 */
export const GALLERY_LAYOUTS = ['mosaic', 'grid', 'carousel'] as const

export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number]

export const GalleryBlock: Block = {
  slug: 'gallery',
  // Emits a `GalleryBlock` interface into payload-types so the public renderer can use
  // the generated type instead of a hand-kept mirror. Type generation only — the slug is
  // what the stored JSON carries, and renaming either would orphan stored blocks.
  interfaceName: 'GalleryBlock',
  labels: { singular: 'معرض صور', plural: 'معارض الصور' },
  fields: [
    {
      name: 'layout',
      type: 'select',
      label: 'طريقة العرض',
      required: true,
      defaultValue: 'mosaic',
      options: [
        // Order matters in the admin dropdown: the default comes first so the common
        // case needs no interaction at all.
        { label: 'فسيفساء', value: 'mosaic' },
        { label: 'شبكة', value: 'grid' },
        { label: 'شريط متحرك', value: 'carousel' },
      ],
      admin: {
        description:
          'فسيفساء: صورة كبيرة مع صور أصغر حولها (تظهر أول خمس صور و«+N» على الأخيرة). شبكة: كل الصور بالحجم نفسه. شريط متحرك: تمرير أفقي.',
      },
    },
    {
      name: 'images',
      type: 'array',
      label: 'الصور',
      labels: { singular: 'صورة', plural: 'صور' },
      // A gallery with no photo is not a gallery — it would render as an empty hole in
      // the article. `minRows` is what makes the editor refuse to save one.
      minRows: 1,
      required: true,
      admin: {
        // NOT setting `isSortable: false`. Payload arrays are drag-reorderable by
        // default and the request explicitly asks for reordering, so this is a
        // deliberate non-setting — noted here so nobody "tidies up" by disabling it.
        description: 'اسحب الصور لإعادة ترتيبها. الترتيب هنا هو ترتيب ظهورها في المقال.',
      },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          label: 'الصورة',
          required: true,
        },
        {
          name: 'caption',
          type: 'text',
          label: 'التعليق (اختياري)',
          admin: {
            description: 'يظهر تحت الصورة وفي العرض الكامل.',
          },
        },
        {
          name: 'alt',
          type: 'text',
          label: 'وصف الصورة لقارئات الشاشة (اختياري)',
          admin: {
            // The media document already carries a required `alt`. This per-row field
            // overrides it for *this* article, because the same photo can mean
            // different things in two different stories. Left empty, the renderer falls
            // back to the media document's own alt — so an empty value is never a
            // missing alt attribute.
            description:
              'اتركه فارغًا لاستخدام الوصف المحفوظ مع الصورة في مكتبة الوسائط.',
          },
        },
      ],
    },
  ],
}
