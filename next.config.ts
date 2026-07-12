import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { securityHeaders } from './src/lib/security-headers'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  images: {
    // #1 RULE: bypass Vercel's image optimizer entirely. All resizing happens
    // at Cloudflare's edge via the custom loader (see lib/image-loader.ts).
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withSentryConfig(withPayload(nextConfig, { devBundleServerPackages: false }), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet during builds; no CSP change (no tunnelRoute).
  silent: true,
  // Upload source maps only when an auth token is present.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
})
