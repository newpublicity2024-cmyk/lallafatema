import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
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
import { Homepage } from './globals/Homepage'
import { MainMenu } from './globals/MainMenu'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Media → Cloudflare R2 (S3-compatible). Enabled only when credentials are present;
// without them, local dev stores uploads on disk. The DB only ever holds references.
const r2Enabled = Boolean(
  process.env.R2_BUCKET &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
)

const storagePlugins = r2Enabled
  ? [
      s3Storage({
        collections: { media: true },
        bucket: process.env.R2_BUCKET as string,
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
  collections: [Posts, Categories, Tags, Videos, MagazineIssues, Pages, Media, Users],
  globals: [Homepage, MainMenu],
  editor: lexicalEditor(),
  // Arabic-first, RTL admin for the editorial team.
  i18n: {
    supportedLanguages: { ar },
    fallbackLanguage: 'ar',
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Migration-driven (no dev auto-push) since dev + prod currently share one Neon DB.
    // Schema changes go through `payload migrate:create` + `payload migrate`.
    push: false,
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [...storagePlugins],
})
