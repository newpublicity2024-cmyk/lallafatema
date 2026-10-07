import { describe, it, expect } from 'vitest'
import type { ArrayField, Block, Field, SelectField, TextField, UploadField } from 'payload'

import { GALLERY_LAYOUTS, GalleryBlock } from '@/blocks/Gallery'
import { VideoEmbedBlock } from '@/blocks/VideoEmbed'
import { articleFeatures } from '@/lib/editor-config'
import { isEmbeddable, parseEmbed } from '@/lib/embeds'
import { altFromFileName, pickImageFiles } from '@/components/admin/editor/mediaUpload'

/**
 * The two in-body blocks and the editor feature list.
 *
 * These specs are written as a CONTRACT suite, not a smoke suite. Both blocks are stored
 * inside the `content` JSONB column of 1,574 live posts and are read back by a public
 * renderer this leaf does not own, so the things most worth pinning are the things a
 * refactor would change without noticing:
 *
 *   - slugs, `interfaceName`s and field NAMES, because stored JSON references them by name
 *     and a rename produces an unrenderable "unknown block" rather than an error;
 *   - the three layout VALUES, because they are an interface with `Gallery.tsx`;
 *   - that every user-facing label is Arabic, because this admin is Arabic-first RTL and a
 *     French/English label is a visible defect in production;
 *   - that the url validator agrees with the shared parser on every input, because the
 *     moment those two disagree you either store something the renderer refuses to render
 *     or refuse something it would happily have rendered.
 */

/** Any Arabic script codepoint — the same test the audit gates apply to labels. */
const ARABIC = /[؀-ۿ]/

type NamedField = Extract<Field, { name: string }>

function fieldsByName(block: Block): Record<string, NamedField> {
  const entries = block.fields
    .filter((field): field is NamedField => 'name' in field && typeof field.name === 'string')
    .map((field) => [field.name, field] as const)
  return Object.fromEntries(entries)
}

/**
 * Payload's `Validate` generics are intentionally narrow; a block field's validator is
 * reached through this shape in the real call path too (Payload invokes it with the value
 * plus an options bag), so widening it here is a faithful call, not a convenience cast.
 */
type FieldValidator = (value: unknown, options: unknown) => string | true | Promise<string | true>

const galleryFields = fieldsByName(GalleryBlock)
const videoFields = fieldsByName(VideoEmbedBlock)

const layoutField = galleryFields.layout as SelectField
const imagesField = galleryFields.images as ArrayField
const imageRowFields = fieldsByName({ fields: imagesField.fields, slug: 'row' })
const urlField = videoFields.url as TextField

const validateUrl = (value: unknown): string | true =>
  (urlField.validate as unknown as FieldValidator)(value, {
    data: {},
    operation: 'create',
    siblingData: {},
  }) as string | true

/* ------------------------------------------------------------------------- */
/* Gallery block                                                             */
/* ------------------------------------------------------------------------- */

describe('GalleryBlock — identity', () => {
  it('keeps the slug and interfaceName the renderer and payload-types depend on', () => {
    expect(GalleryBlock.slug).toBe('gallery')
    expect(GalleryBlock.interfaceName).toBe('GalleryBlock')
  })

  it('labels the block in Arabic', () => {
    expect(GalleryBlock.labels?.singular).toBe('معرض صور')
    expect(GalleryBlock.labels?.plural).toBe('معارض الصور')
  })

  it('exposes exactly two fields — a layout and the photos', () => {
    expect(Object.keys(galleryFields).sort()).toEqual(['images', 'layout'])
  })
})

describe('GalleryBlock — layout', () => {
  it('is a select defaulting to mosaic', () => {
    expect(layoutField.type).toBe('select')
    expect(layoutField.defaultValue).toBe('mosaic')
    expect(layoutField.required).toBe(true)
  })

  it('offers exactly the three contracted values', () => {
    const values = layoutField.options.map((option) =>
      typeof option === 'string' ? option : option.value,
    )
    expect(values).toEqual(['mosaic', 'grid', 'carousel'])
    // `GALLERY_LAYOUTS` is what TypeScript consumers import; it must not drift from the
    // options an editor can actually pick.
    expect([...GALLERY_LAYOUTS].sort()).toEqual([...values].sort())
  })

  it('labels every option in Arabic while storing the English value', () => {
    for (const option of layoutField.options) {
      expect(typeof option).not.toBe('string')
      if (typeof option === 'string') continue
      expect(option.label).toMatch(ARABIC)
      // The stored value is an interface with the public renderer: ASCII, lowercase.
      expect(option.value).toMatch(/^[a-z]+$/)
    }
  })

  it('tells the journalist what each layout does', () => {
    expect(layoutField.admin?.description).toMatch(ARABIC)
  })
})

describe('GalleryBlock — images', () => {
  it('is an array that cannot be empty', () => {
    expect(imagesField.type).toBe('array')
    expect(imagesField.minRows).toBe(1)
    expect(imagesField.required).toBe(true)
  })

  it('stays drag-reorderable', () => {
    // Payload arrays sort by default; the request requires reordering, so the only way to
    // break it is to opt out explicitly. Assert the opt-out is absent rather than truthy —
    // `undefined` and `true` are both correct, `false` is the regression.
    expect(imagesField.admin?.isSortable).not.toBe(false)
  })

  it('gives every row an image, a caption and an alt', () => {
    expect(Object.keys(imageRowFields).sort()).toEqual(['alt', 'caption', 'image'])
  })

  it('requires the image itself and points it at the media collection', () => {
    const image = imageRowFields.image as UploadField
    expect(image.type).toBe('upload')
    expect(image.relationTo).toBe('media')
    expect(image.required).toBe(true)
  })

  it('leaves caption and alt optional', () => {
    // A journalist pasting eight photos must be able to save before writing eight captions.
    expect((imageRowFields.caption as TextField).type).toBe('text')
    expect((imageRowFields.caption as TextField).required).not.toBe(true)
    expect((imageRowFields.alt as TextField).type).toBe('text')
    expect((imageRowFields.alt as TextField).required).not.toBe(true)
  })

  it('labels the array, its rows and every row field in Arabic', () => {
    expect(imagesField.label).toMatch(ARABIC)
    expect(imagesField.labels?.singular).toMatch(ARABIC)
    expect(imagesField.labels?.plural).toMatch(ARABIC)
    for (const field of Object.values(imageRowFields)) {
      expect(field.label).toMatch(ARABIC)
    }
  })

  it('carries no Latin-script label anywhere in the block', () => {
    const labels = [
      GalleryBlock.labels?.singular,
      GalleryBlock.labels?.plural,
      layoutField.label,
      imagesField.label,
      ...Object.values(imageRowFields).map((field) => field.label),
    ]
    for (const label of labels) {
      expect(typeof label).toBe('string')
      expect(String(label)).not.toMatch(/[A-Za-z]/)
    }
  })
})

/* ------------------------------------------------------------------------- */
/* VideoEmbed block — backward compatibility                                 */
/* ------------------------------------------------------------------------- */

describe('VideoEmbedBlock — backward compatibility', () => {
  it('keeps the slug stored content references', () => {
    // C3: renaming this orphans every stored node AND every post version holding one.
    expect(VideoEmbedBlock.slug).toBe('videoEmbed')
    expect(VideoEmbedBlock.interfaceName).toBe('VideoEmbedBlock')
  })

  it('keeps url required and caption optional', () => {
    expect(urlField.type).toBe('text')
    expect(urlField.required).toBe(true)
    const caption = videoFields.caption as TextField
    expect(caption.type).toBe('text')
    // Legacy rows were saved without a caption; requiring it would make them unsaveable.
    expect(caption.required).not.toBe(true)
  })

  it('only ever ADDED a field, and the addition stores nothing', () => {
    expect(Object.keys(videoFields).sort()).toEqual(['caption', 'url', 'urlPreview'])
    // A `ui` field has no column and no entry in the generated interface, so the stored
    // shape of every existing block is byte-for-byte unchanged.
    expect(videoFields.urlPreview.type).toBe('ui')
    expect(videoFields.urlPreview.admin?.components?.Field).toBe(
      '/components/admin/editor/VideoEmbedPreview#default',
    )
  })

  it('labels everything in Arabic', () => {
    expect(VideoEmbedBlock.labels?.singular).toMatch(ARABIC)
    expect(VideoEmbedBlock.labels?.plural).toMatch(ARABIC)
    expect(String(urlField.label)).toMatch(ARABIC)
    expect(String((videoFields.caption as TextField).label)).toMatch(ARABIC)
    expect(String(urlField.admin?.description)).toMatch(ARABIC)
  })
})

/* ------------------------------------------------------------------------- */
/* VideoEmbed block — the url validator (D1)                                 */
/* ------------------------------------------------------------------------- */

/** One URL per supported provider and per URL shape the share sheets hand out. */
const SUPPORTED_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'https://vimeo.com/76979871',
  'https://player.vimeo.com/video/76979871',
  'https://www.dailymotion.com/video/x7tgad0',
  'https://dai.ly/x7tgad0',
  'https://www.facebook.com/watch/?v=1234567890',
  'https://www.facebook.com/reel/1234567890',
  'https://www.facebook.com/lallafatema/posts/1234567890',
  'https://www.instagram.com/p/CxAbCdEfGhI/',
  'https://www.instagram.com/reel/CxAbCdEfGhI/',
  'https://www.tiktok.com/@someuser/video/7212345678901234567',
]

/**
 * Grouped by WHY each one must be refused, so a failure names the property that broke
 * rather than just "a string was accepted".
 */
const REFUSED_URLS: Record<string, string[]> = {
  'hostile schemes (the actual defect — `new URL()` accepts every one of these)': [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'javascript:void(document.cookie)',
  ],
  'host confusion': [
    'https://youtube.com.evil.tld/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com.attacker.example/76979871',
  ],
  'userinfo and ports, which make the real host unreadable': [
    'https://user@evil.tld@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
  ],
  'non-https, which cannot be silently upgraded': [
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '//www.youtube.com/watch?v=dQw4w9WgXcQ',
  ],
  'real providers we cannot embed, and short links we cannot resolve offline': [
    'https://x.com/someone/status/1234567890',
    'https://twitter.com/someone/status/1234567890',
    'https://fb.watch/abcdefg/',
    'https://vm.tiktok.com/ZMabcdefg/',
  ],
  'malformed input': ['not a url', 'https://', 'https://evil.tld/video/1', 'youtube.com/watch?v=x'],
}

describe('VideoEmbedBlock — url validator', () => {
  it('is a function (the gate and the admin both call it directly)', () => {
    expect(typeof urlField.validate).toBe('function')
  })

  it.each(['', '   ', null, undefined])('refuses the empty value %j in Arabic', (value) => {
    const result = validateUrl(value)
    expect(result).not.toBe(true)
    expect(String(result)).toMatch(ARABIC)
  })

  it.each(SUPPORTED_URLS)('accepts %s', (url) => {
    expect(validateUrl(url)).toBe(true)
  })

  for (const [reason, urls] of Object.entries(REFUSED_URLS)) {
    describe(`refuses ${reason}`, () => {
      it.each(urls)('%s', (url) => {
        const result = validateUrl(url)
        expect(result).not.toBe(true)
        expect(typeof result).toBe('string')
      })
    })
  }

  it('explains every refusal in Arabic — an editor never sees an English error', () => {
    for (const url of Object.values(REFUSED_URLS).flat()) {
      expect(String(validateUrl(url))).toMatch(ARABIC)
    }
  })

  it('never throws, whatever it is handed', () => {
    const hostile: unknown[] = [
      {},
      [],
      42,
      true,
      Symbol('x'),
      'https://www.youtube.com/watch?v=' + 'a'.repeat(5000),
      ' javascript:alert(1)',
    ]
    for (const value of hostile) {
      expect(() => validateUrl(value)).not.toThrow()
      expect(validateUrl(value)).not.toBe(true)
    }
  })

  /**
   * The delegation property, and the reason this block may not grow its own host checks:
   * the validator and the renderer must be the same decision. If this ever fails, the two
   * have been allowed to drift and either stored content cannot be rendered or a refused
   * link would have rendered fine.
   */
  it('accepts a URL exactly when the shared parser can embed it', () => {
    const corpus = [...SUPPORTED_URLS, ...Object.values(REFUSED_URLS).flat()]
    for (const url of corpus) {
      expect(validateUrl(url) === true).toBe(isEmbeddable(url))
    }
  })

  it('accepts nothing the parser cannot turn into a rebuilt, allowlisted src', () => {
    for (const url of SUPPORTED_URLS) {
      const embed = parseEmbed(url)
      expect(embed).not.toBeNull()
      expect(embed?.embedSrc).toMatch(/^https:\/\//)
      // The pasted string is never reflected into the src — the parser rebuilds it.
      expect(embed?.embedSrc.includes('evil')).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------------- */
/* Editor feature list                                                       */
/* ------------------------------------------------------------------------- */

describe('articleFeatures()', () => {
  const features = articleFeatures()
  const keys = features.map((feature) => feature.key)

  it('returns features that all identify themselves', () => {
    expect(features.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    }
  })

  it('registers no feature twice', () => {
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each([
    ['heading', 'headings'],
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['strikethrough', 'strikethrough'],
    ['link', 'links (Ctrl+K)'],
    ['unorderedList', 'bullet lists'],
    ['orderedList', 'numbered lists'],
    ['blockquote', 'quotes'],
    ['horizontalRule', 'separator lines'],
    ['experimental_table', 'tables'],
    ['upload', 'images'],
    ['blocks', 'the gallery + video blocks'],
    ['toolbarFixed', 'the always-visible toolbar'],
  ])('enables %s — %s', (key) => {
    expect(keys).toContain(key)
  })

  it('KEEPS the upload feature — 652 live posts contain inline upload nodes', () => {
    // Measured on the real corpus before any change. Dropping `UploadFeature` does not
    // migrate those nodes; it makes them unrenderable in the editor. This assertion is
    // the cheapest possible tripwire on the most expensive available mistake.
    expect(keys).toContain('upload')
  })

  it('offers several heading levels but never h1', () => {
    const heading = features.find((feature) => feature.key === 'heading')
    const sizes = (heading?.serverFeatureProps as { enabledHeadingSizes?: string[] } | undefined)
      ?.enabledHeadingSizes
    expect(Array.isArray(sizes)).toBe(true)
    expect((sizes ?? []).length).toBeGreaterThanOrEqual(2)
    // The article title is the page's only h1; a body h1 is an a11y/SEO regression that
    // no validation would catch.
    expect(sizes).not.toContain('h1')
  })

  it('registers both in-body blocks, by the slug stored content uses', () => {
    const blocks = features.find((feature) => feature.key === 'blocks')
    const registered = (blocks?.serverFeatureProps as { blocks?: { slug: string }[] } | undefined)
      ?.blocks
    const slugs = (registered ?? []).map((block) => block.slug)
    expect(slugs).toContain('gallery')
    expect(slugs).toContain('videoEmbed')
  })

  it('keeps both toolbars — the fixed bar is the request, the inline bar is the habit', () => {
    expect(keys).toContain('toolbarFixed')
    expect(keys).toContain('toolbarInline')
  })

  it('wires the paste/drop shortcuts to the same slugs the blocks declare', () => {
    const smartPaste = features.find((feature) => feature.key === 'lfSmartPaste')
    expect(smartPaste).toBeDefined()
    const feature = smartPaste?.feature
    expect(typeof feature).toBe('object')
    const resolved = feature as {
      ClientFeature?: unknown
      clientFeatureProps?: { galleryBlockSlug?: string; videoBlockSlug?: string }
    }
    expect(resolved.ClientFeature).toBe(
      '/components/admin/editor/SmartPasteFeature#SmartPasteFeatureClient',
    )
    // Hard-coding these in the plugin would let a slug rename produce blocks the editor
    // does not know; they come from the block configs instead.
    expect(resolved.clientFeatureProps?.galleryBlockSlug).toBe(GalleryBlock.slug)
    expect(resolved.clientFeatureProps?.videoBlockSlug).toBe(VideoEmbedBlock.slug)
  })

  it('declares the features it cannot work without, so removing them fails at boot', () => {
    const smartPaste = features.find((feature) => feature.key === 'lfSmartPaste')
    expect(smartPaste?.dependencies).toEqual(['blocks', 'upload'])
  })

  it('returns a fresh list on every call (features are not shared mutable state)', () => {
    const again = articleFeatures()
    expect(again).not.toBe(features)
    expect(again.map((feature) => feature.key)).toEqual(keys)
  })
})

/* ------------------------------------------------------------------------- */
/* Paste helpers                                                             */
/* ------------------------------------------------------------------------- */

const file = (name: string, type: string, size = 1024): File => {
  const made = new File([new Uint8Array(size)], name, { type })
  return made
}

const transfer = (files: File[]): DataTransfer => ({ files }) as unknown as DataTransfer

describe('pickImageFiles', () => {
  it('keeps the raster formats the media guard allows', () => {
    const files = [
      file('a.png', 'image/png'),
      file('b.jpg', 'image/jpeg'),
      file('c.webp', 'image/webp'),
      file('d.avif', 'image/avif'),
      file('e.gif', 'image/gif'),
    ]
    expect(pickImageFiles(transfer(files)).map((f) => f.name)).toEqual([
      'a.png',
      'b.jpg',
      'c.webp',
      'd.avif',
      'e.gif',
    ])
  })

  it('drops SVG — it can carry a script, and the upload guard refuses it anyway', () => {
    expect(pickImageFiles(transfer([file('x.svg', 'image/svg+xml')]))).toEqual([])
  })

  it('drops PDFs even though media accepts them — a PDF is not a gallery photo', () => {
    expect(pickImageFiles(transfer([file('x.pdf', 'application/pdf')]))).toEqual([])
  })

  it('drops anything that is not an image', () => {
    const files = [file('x.txt', 'text/plain'), file('y.zip', 'application/zip'), file('z', '')]
    expect(pickImageFiles(transfer(files))).toEqual([])
  })

  it('keeps only the images out of a mixed drop', () => {
    const files = [file('doc.pdf', 'application/pdf'), file('photo.png', 'image/png')]
    expect(pickImageFiles(transfer(files)).map((f) => f.name)).toEqual(['photo.png'])
  })

  it('handles an absent or empty DataTransfer without throwing', () => {
    expect(pickImageFiles(null)).toEqual([])
    expect(pickImageFiles(undefined)).toEqual([])
    expect(pickImageFiles(transfer([]))).toEqual([])
    expect(pickImageFiles({} as unknown as DataTransfer)).toEqual([])
  })
})

describe('altFromFileName', () => {
  it('turns a file name into something readable', () => {
    expect(altFromFileName('red-carpet-rabat.jpg')).toBe('red carpet rabat')
    expect(altFromFileName('IMG_4821.JPEG')).toBe('IMG 4821')
  })

  it('strips only the final extension', () => {
    expect(altFromFileName('a.b.png')).toBe('a.b')
  })

  it('always returns something — media.alt is required', () => {
    // An empty alt would fail the create, and a failed create looks to the journalist
    // like the paste silently did nothing.
    expect(altFromFileName('.png')).toBe('صورة من المقال')
    expect(altFromFileName('')).toBe('صورة من المقال')
    expect(altFromFileName('___')).toBe('صورة من المقال')
  })
})
