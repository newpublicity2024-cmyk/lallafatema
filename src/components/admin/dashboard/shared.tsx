import type { Where } from 'payload'

import type { Category, Post, User } from '@/payload-types'

/**
 * Shared bits for the dashboard widgets (`admin.dashboard.widgets` in
 * payload.config.ts). Every widget is a server component: it receives Payload's
 * `WidgetServerProps` (`req.payload` + `req.user`) and renders plain markup
 * styled by `src/app/(payload)/dashboard.scss` (the `lf-` classes).
 *
 * Hard navigation (`<a href>`) is correct everywhere here: these are Payload
 * admin routes, not Next app pages, and Payload's own nav uses anchors.
 */

export const ADMIN = '/admin'

export const isEditorial = (user: User | null | undefined): boolean =>
  user?.role === 'admin' || user?.role === 'editor'

/** First name only — "أهلًا سارة" reads friendlier than the full byline. */
export const firstNameOf = (user: User): string =>
  (user.name || user.email).trim().split(/\s+/)[0] ?? ''

/** Drafts a user should care about: journalists their own, editors everyone's. */
export function draftWhere(user: User): Where {
  const base: Where[] = [{ _status: { equals: 'draft' } }]
  if (!isEditorial(user)) base.push({ authors: { in: [user.id] } })
  return { and: base }
}

/**
 * The editor's review queue skips drafts that are still empty shells: opening
 * "create" autosaves an untitled doc, and those would otherwise crowd out real
 * articles waiting for review. Journalists still see their own in `draftWhere`.
 */
export function reviewQueueWhere(user: User): Where {
  return { and: [draftWhere(user), { title: { exists: true } }, { title: { not_equals: '' } }] }
}

export function publishedWhere(user: User, since?: Date): Where {
  const base: Where[] = [{ _status: { equals: 'published' } }]
  if (!isEditorial(user)) base.push({ authors: { in: [user.id] } })
  if (since) base.push({ publishedAt: { greater_than_equal: since.toISOString() } })
  return { and: base }
}

/** Casablanca local-time helpers — the newsroom's clock, not the server's (UTC on Vercel). */
const CASABLANCA = 'Africa/Casablanca'

function casablancaOffsetMs(at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: CASABLANCA, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value // "GMT+01:00"
  const m = part?.match(/([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60_000
}

export function startOfTodayCasablanca(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: CASABLANCA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // "2026-09-15"
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - casablancaOffsetMs(now))
}

export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000)
}

export function casablancaHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: CASABLANCA, hour: 'numeric', hour12: false }).format(now),
  )
}

/** "صباح الخير" until noon, "مساء الخير" after. */
export const greeting = (now = new Date()): string =>
  casablancaHour(now) < 12 ? 'صباح الخير' : 'مساء الخير'

const longDate = new Intl.DateTimeFormat('ar', {
  timeZone: CASABLANCA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
export const todayLabel = (now = new Date()): string => longDate.format(now)

export const categoryNameOf = (post: Post): string | null => {
  const c = post.category
  return c && typeof c === 'object' ? (c as Category).name ?? null : null
}

export const authorNamesOf = (post: Post): string | null => {
  const names = (post.authors ?? [])
    .map((a) => (a && typeof a === 'object' ? (a as User).name : null))
    .filter(Boolean)
  return names.length ? names.join('، ') : null
}

export const titleOf = (post: Post): string => post.title?.trim() || 'بدون عنوان'

export const editHref = (post: Pick<Post, 'id'>): string => `${ADMIN}/collections/posts/${post.id}`

// ── Presentational primitives ────────────────────────────────────────────────

export function Card({
  title,
  icon,
  action,
  children,
  className = '',
}: {
  title?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`lf-card ${className}`} dir="rtl">
      {(title || action) && (
        <header className="lf-card__head">
          {title && (
            <h3 className="lf-card__title">
              {icon && <span className="lf-card__title-icon">{icon}</span>}
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="lf-empty">
      <span className="lf-empty__icon" aria-hidden>
        {icon}
      </span>
      <strong className="lf-empty__title">{title}</strong>
      {hint && <p className="lf-empty__hint">{hint}</p>}
      {action}
    </div>
  )
}

// ── Icons (inline SVG, 24×24 stroke, inherit currentColor) ───────────────────

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const Icons = {
  pen: () => (
    <svg {...svgProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  draft: () => (
    <svg {...svgProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  ),
  check: () => (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  clock: () => (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  eye: () => (
    <svg {...svgProps}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  image: () => (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  home: () => (
    <svg {...svgProps}>
      <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  menu: () => (
    <svg {...svgProps}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  megaphone: () => (
    <svg {...svgProps}>
      <path d="m3 11 18-5v12L3 13v-2Z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  folder: () => (
    <svg {...svgProps}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  tag: () => (
    <svg {...svgProps}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  ),
  book: () => (
    <svg {...svgProps}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  ),
  page: () => (
    <svg {...svgProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  users: () => (
    <svg {...svgProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  ),
  user: () => (
    <svg {...svgProps}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  settings: () => (
    <svg {...svgProps}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  ),
  redirect: () => (
    <svg {...svgProps}>
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      <path d="m9 10-5 5 5 5" />
    </svg>
  ),
  plus: () => (
    <svg {...svgProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  arrow: () => (
    <svg {...svgProps}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  sparkle: () => (
    <svg {...svgProps}>
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M19 17v4M17 19h4M5 3v3M3.5 4.5h3" />
    </svg>
  ),
}
