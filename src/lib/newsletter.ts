import { SITE_URL } from './seo'

export type SubscribeResult = { status: 'ok' | 'invalid' | 'error' | 'disabled' }

/** Newsletter is enabled only when all three Brevo (double-opt-in) vars are set. */
export function newsletterEnabled(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID && process.env.BREVO_DOI_TEMPLATE_ID,
  )
}

/** Dependency-free email sanity check (not full RFC — just rejects obvious junk). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Subscribe an email via Brevo double opt-in: Brevo sends the confirmation email
 * and the contact joins the list only when they click it. Order matters — the
 * disabled short-circuit is first so nothing is sent when unconfigured. Never throws;
 * a Brevo/network failure degrades to { status: 'error' }, never a 500.
 */
export async function subscribe(email: string): Promise<SubscribeResult> {
  if (!newsletterEnabled()) return { status: 'disabled' }
  const clean = email.trim().toLowerCase()
  if (!isValidEmail(clean)) return { status: 'invalid' }
  try {
    const res = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email: clean,
        includeListIds: [Number(process.env.BREVO_LIST_ID)],
        templateId: Number(process.env.BREVO_DOI_TEMPLATE_ID),
        redirectionUrl: `${SITE_URL}/newsletter/confirmed`,
      }),
    })
    return { status: res.ok ? 'ok' : 'error' }
  } catch {
    return { status: 'error' }
  }
}
