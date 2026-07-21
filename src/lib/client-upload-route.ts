import type { Config, Endpoint, PayloadHandler, PayloadRequest } from 'payload'
import { APIError, Forbidden } from 'payload'
import { handleUpload } from '@vercel/blob/client'

import { clientUploadTokenConstraints } from './upload-guard'

/**
 * A drop-in replacement for @payloadcms/storage-vercel-blob's signed-upload
 * route, differing in exactly one way: the generated client token embeds
 * `allowedContentTypes` + `maximumSizeInBytes`, so Vercel Blob itself refuses
 * a disallowed type or an oversized body at PUT time.
 *
 * The plugin's own route generates unconstrained tokens — any authenticated
 * user could push arbitrary bytes (up to Blob's 500MB) straight into storage,
 * bypassing the Media upload guard entirely because client-uploaded files
 * never pass through the server. The plugin exposes no option for these
 * constraints (only `access`), hence the replacement rather than configuration.
 */
const constrainedHandler: PayloadHandler = async (req: PayloadRequest) => {
  if (!req.json) {
    throw new APIError('Unexpected request', 400)
  }
  const body = await req.json()

  try {
    const jsonResponse = await handleUpload({
      body,
      onBeforeGenerateToken: async (_pathname, collectionSlug) => {
        if (!collectionSlug) {
          throw new APIError('No payload was provided')
        }
        // Same auth gate as the plugin default: any authenticated admin user.
        if (!req.user) {
          throw new Forbidden()
        }
        return {
          ...clientUploadTokenConstraints(),
          // Mirror the plugin defaults exactly (addRandomSuffix is off; cache
          // maxage default is applied by Blob) so nothing else changes.
          addRandomSuffix: false,
        }
      },
      onUploadCompleted: async () => {},
      request: req as unknown as Request,
      token: process.env.BLOB_READ_WRITE_TOKEN as string,
    })
    return Response.json(jsonResponse)
  } catch (error) {
    req.payload.logger.error(error)
    throw new APIError('storage-vercel-blob client upload route error')
  }
}

/**
 * Payload plugin: swaps the handler of the endpoint the storage plugin
 * registered at `vercel-blob-client-upload-route`. Must run AFTER the storage
 * plugin in the plugins array. No-op when the endpoint is absent (Blob storage
 * disabled), so local-disk dev keeps working unchanged.
 */
export const constrainClientUploads = (config: Config): Config => {
  const endpoint = (config.endpoints ?? []).find(
    (e: Endpoint) => e.path === 'vercel-blob-client-upload-route' && e.method === 'post',
  )
  if (endpoint) {
    endpoint.handler = constrainedHandler
  }
  return config
}
