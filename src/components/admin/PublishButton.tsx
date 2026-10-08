'use client'

import { PublishButton as DefaultPublishButton } from '@payloadcms/ui'

/**
 * Every role that can reach an article can publish it, so everyone gets Payload's own
 * button.
 *
 * This component used to swap the button for a note ("يُنشره المحرّر بعد المراجعة") for
 * journalists, because `applyPostDefaults` rejected their publish with a 403 and showing
 * them the button would only have produced an error toast. That restriction was lifted at
 * the owner's instruction — journalists publish their own work now — so the note would be
 * a lie and the button is correct for everyone.
 *
 * The override is kept rather than removed so the seam stays in one place: if publishing
 * ever needs a role rule again, it belongs here for the UI and in `postDefaults` /
 * `canModifyOwnPosts` for enforcement, not scattered across both.
 */
export default function PublishButton() {
  return <DefaultPublishButton />
}
