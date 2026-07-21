/**
 * Role-based field visibility for the admin UI.
 *
 * IMPORTANT: `admin.condition` hides a field from the UI — it does NOT block an
 * API write. Use it only for fields that are noise rather than a privilege
 * boundary. Anything that genuinely must not be written by a role needs
 * field-level `access` (see `authors` in Posts, which keeps both).
 */

type MaybeUser = { role?: string } | null | undefined

export const isEditorialUser = (user: MaybeUser): boolean =>
  user?.role === 'admin' || user?.role === 'editor'

/**
 * Shows a field to admins and editors only. Journalists get a screen with just
 * the things they actually decide: title, media, content, category.
 */
export const editorialOnly = (
  _data: unknown,
  _siblingData: unknown,
  { user }: { user?: MaybeUser },
): boolean => isEditorialUser(user)
