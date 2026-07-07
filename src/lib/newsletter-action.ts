'use server'

import { subscribe, type SubscribeResult } from './newsletter'

export type SignupState = SubscribeResult | { status: 'idle' }

/**
 * Footer newsletter form action. Honeypot: bots fill the hidden `company` field,
 * humans leave it empty — a filled honeypot silently "succeeds" without calling Brevo.
 * The Brevo API key lives in `subscribe` (server-only); this module is `'use server'`,
 * so the client only receives an RPC stub.
 */
export async function subscribeAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  if (String(formData.get('company') ?? '').trim() !== '') return { status: 'ok' }
  const email = String(formData.get('email') ?? '')
  return subscribe(email)
}
