import type { Access, FieldAccess, Where } from 'payload'

/**
 * Role model (least privilege):
 *   admin      — full control over everything.
 *   editor     — manages and publishes all editorial content + taxonomy + media.
 *   journalist — creates and edits ONLY their own drafts; cannot publish.
 */

export const anyone: Access = () => true

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
  if (user) {
    return {
      or: [{ _status: { equals: 'published' } }, { authors: { in: [user.id] } }],
    } as Where
  }
  return { _status: { equals: 'published' } }
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
