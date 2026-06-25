import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Posts, Categories, Tags, Videos, MagazineIssues, Pages, Media, Users],
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
  plugins: [],
})
