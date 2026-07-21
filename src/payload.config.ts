import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { ar } from '@payloadcms/translations/languages/ar'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { VideoEmbedBlock } from './blocks/VideoEmbed'
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
    importMap: {
      baseDir: path.resolve(dirname),
    },
    // Editorial control-center landing panel (quick actions + my drafts), RTL.
    components: {
      beforeDashboard: ['/components/admin/BeforeDashboard#default'],
      // Brand the admin login wordmark + nav icon (matches the public favicon).
      graphics: {
        Logo: '/components/admin/Logo#default',
        Icon: '/components/admin/Icon#default',
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
  // Deliberately trimmed to what a non-technical journalist uses. Verified safe
  // against all 1060 live posts: existing content uses only h2/h3, ul/ol, bold,
  // italic, links, quotes and uploads — no stored node depends on a removed
  // feature, so no historical article can lose its formatting.
  editor: lexicalEditor({
    features: () => [
      ParagraphFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
      BoldFeature(),
      ItalicFeature(),
      UnderlineFeature(),
      LinkFeature(),
      UnorderedListFeature(),
      OrderedListFeature(),
      BlockquoteFeature(),
      UploadFeature(),
      HorizontalRuleFeature(),
      BlocksFeature({ blocks: [VideoEmbedBlock] }),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ],
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
