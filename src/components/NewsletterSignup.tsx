'use client'

import { useActionState } from 'react'

import { subscribeAction, type SignupState } from '@/lib/newsletter-action'

const MESSAGES: Record<Exclude<SignupState['status'], 'idle'>, string> = {
  ok: 'تفقّد بريدك الإلكتروني لتأكيد الاشتراك.',
  invalid: 'يرجى إدخال بريد إلكتروني صحيح.',
  error: 'تعذّر الاشتراك، حاول مرّة أخرى.',
  disabled: 'النشرة ستتوفر قريبًا.',
}

const INITIAL: SignupState = { status: 'idle' }

export function NewsletterSignup() {
  const [state, action, pending] = useActionState(subscribeAction, INITIAL)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h4 className="font-bold text-zinc-900">النشرة البريدية</h4>
      <p className="mt-1 text-sm text-zinc-600">اشترك لتصلك أحدث المقالات في بريدك.</p>
      <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
        {/* Honeypot — hidden from users, catches bots. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <input
          type="email"
          name="email"
          required
          placeholder="بريدك الإلكتروني"
          aria-label="بريدك الإلكتروني"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? '…' : 'اشترك'}
        </button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-zinc-600">
        {state.status !== 'idle' ? MESSAGES[state.status] : ''}
      </p>
    </div>
  )
}
