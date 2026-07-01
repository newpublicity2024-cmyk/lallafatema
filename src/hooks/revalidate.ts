import { revalidatePath } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload'

/**
 * On-publish revalidation (decouples visitor traffic from the DB — see brief 6.5).
 * Revalidates the whole frontend (root layout) whenever content/config changes.
 * Wrapped in try/catch so Local API mutations outside a request scope (seed
 * scripts) don't throw. Runs in-process — admin saves go through the Next route
 * handler, where revalidatePath is valid.
 */
export function revalidateSite(): void {
  try {
    revalidatePath('/', 'layout')
  } catch {
    /* outside request scope (e.g. seed script) — ignore */
  }
}

export const revalidateAfterChange: CollectionAfterChangeHook = ({ doc }) => {
  revalidateSite()
  return doc
}

export const revalidateAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  revalidateSite()
  return doc
}

export const revalidateGlobalAfterChange: GlobalAfterChangeHook = ({ doc }) => {
  revalidateSite()
  return doc
}

export const revalidateRedirects: CollectionAfterChangeHook = ({ doc }) => {
  try {
    revalidatePath('/redirects-map.json')
  } catch {
    /* outside request scope — ignore */
  }
  revalidateSite()
  return doc
}

export const revalidateRedirectsAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  try {
    revalidatePath('/redirects-map.json')
  } catch {
    /* ignore */
  }
  revalidateSite()
  return doc
}
