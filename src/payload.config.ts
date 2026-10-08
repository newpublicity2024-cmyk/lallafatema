import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { ar } from '@payloadcms/translations/languages/ar'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'
import { Posts } from './collections/Posts'
import { Videos } from './collections/Videos'
import { MagazineIssues } from './collections/MagazineIssues'
import { Pages } from './collections/Pages'
import { Ads } from './collections/Ads'
import { Redirects } from './collections/Redirects'
import { Homepage } from './globals/Homepage'
import { MainMenu } from './globals/MainMenu'
import { SiteSettings } from './globals/SiteSettings'
import { articleFeatures } from './lib/editor-config'
import { allowedOrigins } from './lib/origins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Neon requires SSL. `pg-connection-string` now warns that sslmode=require|prefer|
// verify-ca are aliased to `verify-full` and will change semantics in pg v9. We
// already connect with verified TLS, so make it explicit — same behavior today,
// no deprecation warning, future-proof. Only the sslmode value is rewritten so
// credentials in the URI are left untouched.
const explicitSslMode = (uri: string): string =>
  uri.replace(/([?&]sslmode=)(?:require|prefer|verify-ca)(?=&|$)/i, '$1verify-full')

// Media storage. The DB only ever holds references; the files live in object storage.
// Preference order: Vercel Blob (BLOB_READ_WRITE_TOKEN) → Cloudflare R2 (R2_*) →
// local disk (dev only, ephemeral on Vercel). Vercel image optimization is never used
// regardless — the custom next/image loader (lib/image-loader.ts) serves stored URLs.
const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN)

const r2Enabled = Boolean(
  process.env.R2_BUCKET &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
)

const storagePlugins = blobEnabled
  ? [
      vercelBlobStorage({
        collections: { media: true },
        token: process.env.BLOB_READ_WRITE_TOKEN as string,
        // Browser uploads straight to Blob (signed, auth-gated route). Without
        // this, the file rides inside the POST to /api/media and Vercel kills
        // any body > 4.5 MB at the edge — a normal phone photo — leaving the
        // admin stuck on "loading" with no error.
        //
        // Server-side validation is NOT bypassed: on doc-create Payload re-fetches
        // the stored object and rebuilds req.file (real bytes + Content-Type), so
        // its native buffer-sniff runs AND the Media beforeValidate guard
        // (enforceUploadGuard) validates the declared mimeType/filesize. See the
        // guard for how the type + per-size caps are enforced on this path.
        clientUploads: true,
      }),
    ]
  : r2Enabled
    ? [
        s3Storage({
          collections: { media: true },
          bucket: process.env.R2_BUCKET as string,
          // Same 4.5 MB rationale as the Blob branch — direct-to-storage uploads
          // so a future switch to R2 doesn't reintroduce the serverless body cap.
          clientUploads: true,
          config: {
            endpoint: process.env.R2_ENDPOINT,
            region: 'auto',
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
              secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
            },
          },
        }),
      ]
    : []

export default buildConfig({
  admin: {
    user: Users.slug,
    /**
     * Pin the admin to the light theme.
     *
     * `custom.scss` is a LIGHT theme: it pins `--theme-bg`, `--theme-text` and
     * `--theme-elevation-50…200` on bare `:root` and hardcodes white surfaces on the nav,
     * header, cards, inputs, doc-controls and the Lexical toolbar. Payload's default here
     * is `'all'`, which lets the panel render with `data-theme="dark"` — and then the
     * palette is MIXED, because Payload's dark values survive everywhere custom.scss does
     * not reach. Measured on production before this change: `--theme-elevation-0: #141414`
     * (Payload dark) under `--theme-bg: #faf8f9` (ours), with `--theme-elevation-800`
     * resolving to #ebebeb — so form input text rendered at a contrast ratio of 1.19:1
     * against a white field, i.e. invisible, and the same collapse hit menus and buttons.
     *
     * Pinning light is the honest fix for a stylesheet that only defines one palette: it
     * also removes the theme selector, so no stored per-user preference can bring the
     * broken combination back. Supporting dark properly would mean authoring a second
     * palette for all ~630 lines of custom.scss, which is a separate piece of work.
     */
    theme: 'light',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      // Brand the admin login wordmark + nav icon (matches the public favicon).
      graphics: {
        Logo: '/components/admin/Logo#default',
        Icon: '/components/admin/Icon#default',
      },
    },
    // The landing page is built from widgets (src/components/admin/dashboard/*)
    // instead of Payload's collection cards, and laid out per role: a journalist
    // gets their drafts, their published pieces and a 3-step guide; editors get
    // the review queue, the newsroom numbers and shortcuts into curation. Users
    // can still rearrange or add widgets (the built-in "collections" cards stay
    // registered) from the dashboard breadcrumb menu.
    dashboard: {
      widgets: [
        { slug: 'lf-welcome', label: 'الترحيب', Component: '/components/admin/dashboard/Welcome#default', minWidth: 'medium' },
        { slug: 'lf-stats', label: 'الأرقام', Component: '/components/admin/dashboard/Stats#default', minWidth: 'medium' },
        { slug: 'lf-drafts', label: 'المسوّدات', Component: '/components/admin/dashboard/Drafts#default', minWidth: 'small' },
        { slug: 'lf-published', label: 'نُشر مؤخرًا', Component: '/components/admin/dashboard/RecentlyPublished#default', minWidth: 'small' },
        { slug: 'lf-shortcuts', label: 'اختصارات', Component: '/components/admin/dashboard/Shortcuts#default', minWidth: 'small' },
        { slug: 'lf-guide', label: 'دليل سريع', Component: '/components/admin/dashboard/Guide#default', minWidth: 'small' },
      ],
      defaultLayout: ({ req }) => {
        const editorial = req.user?.role === 'admin' || req.user?.role === 'editor'
        return editorial
          ? [
              { widgetSlug: 'lf-welcome', width: 'full' },
              { widgetSlug: 'lf-stats', width: 'full' },
              { widgetSlug: 'lf-drafts', width: 'medium' },
              { widgetSlug: 'lf-published', width: 'medium' },
              { widgetSlug: 'lf-shortcuts', width: 'full' },
            ]
          : [
              { widgetSlug: 'lf-welcome', width: 'full' },
              { widgetSlug: 'lf-stats', width: 'full' },
              { widgetSlug: 'lf-drafts', width: 'medium' },
              { widgetSlug: 'lf-published', width: 'medium' },
              { widgetSlug: 'lf-guide', width: 'large' },
              { widgetSlug: 'lf-shortcuts', width: 'small' },
            ]
      },
    },
    // Live preview against the real frontend (draft-aware via /preview).
    livePreview: {
      collections: ['posts', 'pages'],
      breakpoints: [
        { label: 'هاتف', name: 'mobile', width: 375, height: 667 },
        { label: 'لوحي', name: 'tablet', width: 768, height: 1024 },
        { label: 'سطح المكتب', name: 'desktop', width: 1440, height: 900 },
      ],
      url: ({ data, collectionConfig }) => {
        const base = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
        const secret = process.env.REVALIDATE_SECRET || ''
        return `${base}/preview?secret=${secret}&collection=${collectionConfig?.slug}&id=${data?.id}`
      },
    },
  },
  collections: [Posts, Categories, Tags, Videos, MagazineIssues, Pages, Ads, Redirects, Media, Users],
  globals: [Homepage, MainMenu, SiteSettings],
  // The whole feature list lives in `lib/editor-config.ts` so it can be inspected
  // without booting Payload (the back-office audit gates import `articleFeatures()`
  // directly and read each feature's key). It is additive over what shipped before:
  // every previously enabled feature is still there — including `UploadFeature`, which
  // 652 live posts depend on — plus strikethrough, tables, the Galerie block and the
  // paste/drop shortcuts. No stored node loses its renderer.
  editor: lexicalEditor({
    features: () => articleFeatures(),
  }),
  // Arabic-first, RTL admin for the editorial team.
  i18n: {
    supportedLanguages: { ar },
    fallbackLanguage: 'ar',
  },
  secret: process.env.PAYLOAD_SECRET || '',
  // CSRF: only these origins may send Payload auth cookies (empty default = no origin check).
  csrf: allowedOrigins(),
  // CORS: same allowlist — never '*'.
  cors: allowedOrigins(),
  // Namespace auth cookies.
  cookiePrefix: 'lf',
  // Global hard cap for all upload collections (busboy). Per-type caps live in the Media
  // guard; this is the outer backstop against oversized/DoS uploads.
  upload: {
    limits: { fileSize: 41_943_040 }, // 40 MB
    abortOnLimit: true,
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Migration-driven (no dev auto-push) since dev + prod currently share one Neon DB.
    // Schema changes go through `payload migrate:create` + `payload migrate`.
    push: false,
    pool: {
      connectionString: explicitSslMode(process.env.DATABASE_URL || ''),
    },
  }),
  sharp,
  plugins: [...storagePlugins],
})
