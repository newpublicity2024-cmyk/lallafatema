import type { Access, FieldAccess, Where } from 'payload'

import { publishedWhere } from '../lib/published-where'

/**
 * Role model (least privilege):
 *   admin      — full control over everything.
 *   editor     — manages and publishes all editorial content + taxonomy + media.
 *   journalist — creates and edits ONLY their own drafts; cannot publish.
 */

export const anyone: Access = () => true

/**
 * `admin.hidden` predicate: keep a collection/global out of a journalist's nav,
 * dashboard and admin routes. Their access rules already stop them from
 * changing anything there; hiding it just keeps their screen to what they use
 * (articles + images). REST and relationship fields are unaffected.
 *
 * `user` is typed loosely on purpose: collections pass a `ClientUser`, globals a
 * `User | null`, and this one predicate has to satisfy both signatures.
 */
export const hiddenFromJournalists = ({ user }: { user?: unknown }): boolean =>
  (user as { role?: string } | null | undefined)?.role === 'journalist'

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'

export const isAdminOrEditor: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

/** Admins can act on anyone; everyone else only on their own user document. */
export const isAdminOrSelf: Access = ({ req: { user }, id }) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.id === id
}

/** Field-level: only admins may set sensitive fields (e.g. a user's role). */
export const isAdminFieldLevel: FieldAccess = ({ req: { user } }) => user?.role === 'admin'

/** Field-level: admins or editors (e.g. reassigning a post's authors). */
export const isAdminOrEditorFieldLevel: FieldAccess = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

/**
 * Post read access:
 *   - public + journalists: only published posts (journalists also see their own drafts)
 *   - admin/editor: everything
 */
export const canReadPosts: Access = ({ req: { user } }) => {
  if (user?.role === 'admin' || user?.role === 'editor') return true
  // `publishedWhere()` rather than a bare `_status` check: `/api/posts` answers
  // anonymously, so a story scheduled for next week would otherwise be one public fetch
  // away even while every rendered listing correctly hides it. A journalist still sees
  // their OWN work whatever its date — the schedule governs the public, not the author.
  if (user) {
    return { or: [publishedWhere(), { authors: { in: [user.id] } }] } as Where
  }
  return publishedWhere()
}

/**
 * Generic read access for draft-enabled collections without per-author ownership
 * (videos, magazine issues, pages): public sees only published; editors/admins see all.
 */
export const canReadPublished: Access = ({ req: { user } }) => {
  if (user?.role === 'admin' || user?.role === 'editor') return true
  return { _status: { equals: 'published' } }
}

/**
 * Post create/update/delete:
 *   - admin/editor: all posts
 *   - journalist: only posts they author
 */
export const canModifyOwnPosts: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'editor') return true
  return { authors: { in: [user.id] } }
}
