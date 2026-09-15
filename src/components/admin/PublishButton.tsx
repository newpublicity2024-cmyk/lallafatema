'use client'

import { PublishButton as DefaultPublishButton, useAuth } from '@payloadcms/ui'

/**
 * Journalists cannot publish (the beforeChange hook in hooks/postDefaults.ts
 * rejects it with a 403), so showing them Payload's "نشر التغييرات" button only
 * invites an error toast. They see a quiet reassurance instead; editors and
 * admins get the stock button.
 */
export default function PublishButton() {
  const { user } = useAuth()

  if (user && user.role !== 'admin' && user.role !== 'editor') {
    return (
      <span className="lf-publish-note" dir="rtl">
        يُحفظ تلقائيًا · يُنشره المحرّر بعد المراجعة
      </span>
    )
  }

  return <DefaultPublishButton />
}
