import { waitUntil } from '@vercel/functions'

/**
 * Run work after the response has been sent (CRM forwarding, lead emails, deploy hook).
 * On Vercel the function is frozen once it responds, so the promise is handed to waitUntil to keep it alive until it
 * settles. On a long-running Node server waitUntil is a no-op and the promise simply runs.
 */
export function background(work: Promise<unknown>) {
  const safe = work.catch(() => undefined)
  try {
    waitUntil(safe)
  } catch {
    /* not in a request context (scripts): nothing to extend */
  }
}
