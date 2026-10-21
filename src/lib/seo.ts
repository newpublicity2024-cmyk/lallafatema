import type { Metadata } from 'next'

import type { SiteConfig } from '@/lib/queries'
import type { Media, MagazineIssue, Post } from '@/payload-types'
import { SITE } from '@/lib/site'
import { authorUrl, postUrl } from '@/lib/routes'
import { embedUrl, youtubeThumbnailUrl } from '@/lib/video'

/** Canonical origin for every absolute URL (canonical tags, OG, sitemaps, RSS). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://lallafatema.ma').replace(
  /\/$/,
  '',
)

const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST

/** Make any path or already-absolute URL absolute against SITE_URL. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

const asMedia = (v: number | Media | null | undefined): Media | null =>
  v && typeof v === 'object' ? v : null

/**
 * Absolute 1200×630 OG image URL. Routes through Cloudflare Image Transformations
 * when NEXT_PUBLIC_IMAGE_HOST is set (same edge path as next/image), otherwise the
 * raw absolute media URL. Falls back to `fallback` (Site Settings defaultOgImage).
 * Never touches Vercel's optimizer.
 */
export function ogImageUrl(
  image: number | Media | null | undefined,
  fallback?: Media | null,
): string | undefined {
  const media = asMedia(image) ?? fallback ?? null
  if (!media?.url) return undefined
  const src = absoluteUrl(media.url)
  if (!IMAGE_HOST) return src
  const host = IMAGE_HOST.replace(/\/$/, '')
  const source = src.startsWith('http') ? src : src.replace(/^\//, '')
  return `${host}/cdn-cgi/image/width=1200,height=630,fit=cover,format=auto/${source}`
}

type BuildMetaArgs = {
  title: string
  description?: string | null
  /** Canonical path, e.g. `/fashion/foo-12`. */
  path: string
  /** Already-resolved absolute OG image URL (from ogImageUrl). */
  image?: string
  type?: 'website' | 'article' | 'profile'
  publishedTime?: string | null
  modifiedTime?: string | null
  authors?: string[]
  section?: string | null
  noIndex?: boolean
  /** Explicit canonical override (post/category `seo.canonicalURL`). */
  canonicalOverride?: string | null
}

/** Build a Next Metadata object with canonical, OpenGraph, Twitter, and robots. */
export function buildMetadata(args: BuildMetaArgs): Metadata {
  const {
    title,
    description,
    path,
    image,
    type = 'website',
    publishedTime,
    modifiedTime,
    authors,
    section,
    noIndex,
    canonicalOverride,
  } = args
  const canonical = canonicalOverride || path
  const images = image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined

  return {
    title,
    description: description ?? undefined,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type,
      url: canonical,
      title,
      description: description ?? undefined,
      siteName: SITE.name,
      locale: 'ar_AR',
      images,
      ...(type === 'article'
        ? {
            publishedTime: publishedTime ?? undefined,
            modifiedTime: modifiedTime ?? undefined,
            authors,
            section: section ?? undefined,
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description ?? undefined,
      images: image ? [image] : undefined,
    },
  }
}

// ─────────────────────────── JSON-LD builders ───────────────────────────

const CONTEXT = 'https://schema.org' as const

function orgLogo(cfg: SiteConfig): string {
  return cfg.logo?.url ? absoluteUrl(cfg.logo.url) : absoluteUrl('/icon.svg')
}

export function organizationJsonLd(cfg: SiteConfig) {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: cfg.name,
    url: SITE_URL,
    logo: orgLogo(cfg),
    sameAs: cfg.social.map((s) => s.href),
  }
}

export function webSiteJsonLd(cfg: SiteConfig) {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: cfg.name,
    url: SITE_URL,
    inLanguage: 'ar',
    description: cfg.tagline,
    // Sitelinks search box → the /search page (?q=). Lights up as soon as the
    // Meilisearch provider is activated; the endpoint already resolves.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function newsArticleJsonLd(post: Post, cfg: SiteConfig) {
  const url = absoluteUrl(postUrl(post))
  const category =
    post.category && typeof post.category === 'object' ? post.category : null
  const authors = (post.authors ?? [])
    .filter((a): a is Extract<typeof a, { id: number }> => typeof a === 'object')
    .map((a) => ({ '@type': 'Person', name: a.name, url: absoluteUrl(authorUrl(a.id)) }))
  const image = ogImageUrl(post.seo?.ogImage, asMedia(post.featuredImage) ?? cfg.defaultOgImage)

  return {
    '@context': CONTEXT,
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: image ? [image] : undefined,
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    inLanguage: 'ar',
    articleSection: category?.name,
    author: authors.length ? authors : { '@type': 'Organization', name: cfg.name },
    publisher: {
      '@type': 'Organization',
      name: cfg.name,
      logo: { '@type': 'ImageObject', url: orgLogo(cfg) },
    },
  }
}

/**
 * Recipe JSON-LD for kitchen posts. Emits only the fields we can produce validly:
 * prep/cook times are free-text Arabic ("20 دقيقة"), not ISO-8601 durations, so
 * they are intentionally omitted rather than emitted invalid.
 */
export function recipeJsonLd(post: Post) {
  const r = post.recipe
  if (!post.isRecipe || !r) return null
  const image = ogImageUrl(post.featuredImage)
  return {
    '@context': CONTEXT,
    '@type': 'Recipe',
    name: post.title,
    description: post.excerpt ?? undefined,
    image: image ? [image] : undefined,
    inLanguage: 'ar',
    recipeCuisine: r.cuisine ?? undefined,
    recipeYield: r.servings ?? undefined,
    recipeIngredient: (r.ingredients ?? []).map((i) => i.item),
    recipeInstructions: (r.instructions ?? []).map((s) => ({
      '@type': 'HowToStep',
      text: s.step,
    })),
  }
}

/**
 * The first self-hosted `videoFile` block in an article body, resolved to the media
 * documents it points at.
 *
 * Walks only the root's own children: the block is inserted at the top level of the article
 * flow (a journalist drops it between paragraphs), and a recursive crawl of every list item
 * and table cell in a 1,500-article archive would be cost without a caller.
 *
 * Returns null unless the relationship was POPULATED — `getPostById` asks for `depth: 2`, so
 * the article page has real documents here, but a caller that fetched at depth 0 holds bare
 * ids and there is no URL to publish. Emitting a VideoObject with a missing `contentUrl`
 * would be worse than emitting none: it is a structured-data error Google reports against
 * the whole page.
 */
function firstUploadedVideo(post: Post): { video: Media; poster: Media | null } | null {
  const children = (post.content as { root?: { children?: unknown[] } } | null)?.root?.children
  if (!Array.isArray(children)) return null

  for (const child of children) {
    const fields = (child as { fields?: { blockType?: string; video?: unknown; poster?: unknown } })
      ?.fields
    if (fields?.blockType !== 'videoFile') continue
    const video = asMedia(fields.video as Media | number | null | undefined)
    if (!video?.url) continue
    return { video, poster: asMedia(fields.poster as Media | number | null | undefined) }
  }
  return null
}

export function videoObjectJsonLdForPost(post: Post) {
  if (post.featuredType !== 'video' || !post.featuredVideoUrl) return uploadedVideoObjectJsonLd(post)
  const thumb = asMedia(post.featuredImage)
  // Thumbnail is required for Google video rich results; fall back to the YouTube
  // poster (same source the hero uses) when no image was uploaded.
  const thumbUrl = thumb?.url ? absoluteUrl(thumb.url) : youtubeThumbnailUrl(post.featuredVideoUrl)
  return {
    '@context': CONTEXT,
    '@type': 'VideoObject',
    name: post.title,
    description: post.excerpt ?? post.title,
    thumbnailUrl: thumbUrl ? [thumbUrl] : undefined,
    uploadDate: post.publishedAt ?? post.createdAt,
    contentUrl: post.featuredVideoUrl,
    // Prefer the canonical embed URL (youtube.com/embed/ID) when derivable.
    embedUrl: embedUrl(post.featuredVideoUrl) ?? post.featuredVideoUrl,
    inLanguage: 'ar',
  }
}

/**
 * VideoObject for an article whose video is a FILE we host, not a platform link.
 *
 * Deliberately reached only when there is no header video: one page should describe one
 * primary video, and the header is the primary one whenever it exists. An article with both
 * still gets the header's VideoObject, which is the video a reader sees first.
 *
 * No `embedUrl`: there is no third-party player page to point at, and schema.org asks for
 * `contentUrl` OR `embedUrl` rather than both. No `duration` either — the media document
 * does not record one, and inventing an ISO-8601 duration we have not measured would be a
 * structured-data lie about our own content.
 */
function uploadedVideoObjectJsonLd(post: Post) {
  const found = firstUploadedVideo(post)
  if (!found) return null

  // Thumbnail is required for Google video rich results. The block's own poster is the
  // frame the reader actually sees, so it wins over the article's cover image.
  const thumb = found.poster ?? asMedia(post.featuredImage)

  return {
    '@context': CONTEXT,
    '@type': 'VideoObject',
    name: post.title,
    description: post.excerpt ?? post.title,
    thumbnailUrl: thumb?.url ? [absoluteUrl(thumb.url)] : undefined,
    uploadDate: post.publishedAt ?? post.createdAt,
    contentUrl: absoluteUrl(found.video.url as string),
    inLanguage: 'ar',
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  }
}

export function publicationIssueJsonLd(issue: MagazineIssue) {
  const cover = asMedia(issue.cover)
  const pdf = asMedia(issue.pdf)
  return {
    '@context': CONTEXT,
    '@type': 'PublicationIssue',
    name: issue.title || `العدد ${issue.issueNumber}`,
    issueNumber: issue.issueNumber,
    datePublished: issue.publishDate ?? undefined,
    image: cover?.url ? absoluteUrl(cover.url) : undefined,
    inLanguage: 'ar',
    isPartOf: { '@type': 'Periodical', name: 'لالة فاطمة' },
    associatedMedia: pdf?.url
      ? { '@type': 'MediaObject', contentUrl: absoluteUrl(pdf.url), encodingFormat: 'application/pdf' }
      : undefined,
  }
}
