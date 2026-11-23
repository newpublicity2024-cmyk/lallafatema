import type { MagazineIssue, Media } from '@/payload-types'
import { issueNumberFromParam } from './routes'

/**
 * Magazine archive paging, shared by the `/magazine` page (server), the
 * `/magazine/issues` batch endpoint and the `MagazineArchive` client component.
 * Imports types only, so it is safe in the client bundle.
 */

/** Issues `/magazine` renders up front, and how many each "load more" click adds. */
export const MAGAZINE_PAGE_SIZE = 20

/**
 * The slice of an issue the archive grid reads, and nothing more. The first batch
 * (server-rendered) and every appended batch (JSON) share this one shape, which
 * keeps both small: a depth-1 Media doc carries a dozen fields a card never reads.
 */
export type IssueCardData = {
  id: number
  issueNumber: number
  title: string | null
  publishDate: string | null
  cover: Pick<Media, 'url' | 'alt'> | null
  /** The PDF's media id, or null for a cover-only archive issue. */
  pdf: number | null
}

/** One batch of the archive, newest first. */
export type IssueBatch = {
  issues: IssueCardData[]
  /** True when older published issues exist below the last one in `issues`. */
  hasMore: boolean
}

export function toIssueCardData(issue: MagazineIssue): IssueCardData {
  const cover = issue.cover && typeof issue.cover === 'object' ? issue.cover : null
  const pdf = issue.pdf ?? null
  return {
    id: issue.id,
    issueNumber: issue.issueNumber,
    title: issue.title ?? null,
    publishDate: issue.publishDate ?? null,
    cover: cover?.url ? { url: cover.url, alt: cover.alt } : null,
    pdf: pdf === null ? null : typeof pdf === 'object' ? pdf.id : pdf,
  }
}

/**
 * True when the issue has a PDF to open. Archived back-issues exist only as a cover
 * image, so they must not link to a page that promises a PDF reader.
 */
export function issueHasPdf(issue: { pdf?: number | Pick<Media, 'id'> | null }): boolean {
  return issue.pdf != null
}

/**
 * Parse the `before` cursor of `/magazine/issues?before=<issueNumber>`: a positive
 * integer issue number, else null. The cursor is the last issue number already on
 * screen, so a batch is "the next N issues numbered below it". Unlike an offset,
 * that stays correct when a new issue is published between two clicks: nothing
 * shifts, so nothing is shown twice or skipped.
 */
export function parseBeforeCursor(raw: string | null): number | null {
  if (raw === null) return null
  const n = issueNumberFromParam(raw)
  return n !== null && Number.isSafeInteger(n) ? n : null
}

/** URL of the batch of issues numbered below `before`. */
export function magazineBatchUrl(before: number): string {
  return `/magazine/issues?before=${before}`
}
