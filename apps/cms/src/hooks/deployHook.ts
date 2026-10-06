/**
 * Rebuild trigger for the static Astro site. When published content changes, POST to DEPLOY_HOOK_URL
 * (Netlify / Vercel / Cloudflare Pages build hook). Calls are debounced so a burst of edits triggers one build.
 *
 * Skipped for: draft saves (autosave or "Save draft"), when DEPLOY_HOOK_URL is unset, and when the operation
 * passes `context: { disableDeployHook: true }` (the seed script does).
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'
import { background } from '../lib/background'
import { int } from '../lib/env'

let pending: { timer: ReturnType<typeof setTimeout>; done: () => void } | null = null
const reasons = new Set<string>()

async function fire(req: PayloadRequest | undefined) {
  const url = process.env.DEPLOY_HOOK_URL
  if (!url) return
  const why = Array.from(reasons).join(', ')
  reasons.clear()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'flight-experts-cms', reason: why, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    })
    req?.payload.logger.info(`[deploy-hook] triggered (${res.status}) for: ${why}`)
  } catch (err) {
    req?.payload.logger.error(`[deploy-hook] failed: ${(err as Error).message}`)
  }
}

export function scheduleDeploy(reason: string, req?: PayloadRequest) {
  if (!process.env.DEPLOY_HOOK_URL) return
  if (req?.context?.disableDeployHook) return
  reasons.add(reason)
  // a newer change restarts the wait; the superseded wait is released (its reasons fire with this one)
  if (pending) {
    clearTimeout(pending.timer)
    pending.done()
  }
  // Vercel freezes the function after it responds, so keep the wait short there (it is held open with waitUntil)
  const wait = int(process.env.DEPLOY_HOOK_DEBOUNCE_MS, process.env.VERCEL ? 3_000 : 15_000)
  background(
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        pending = null
        void fire(req).finally(resolve)
      }, wait)
      // do not keep a script (e.g. seed) alive just for this
      ;(timer as { unref?: () => void }).unref?.()
      pending = { timer, done: resolve }
    }),
  )
}

type Status = { _status?: 'draft' | 'published' | null }

/** Collections: rebuild when a published doc changes, or when a published doc is unpublished. */
export const deployAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, collection, req }) => {
  const now = (doc as Status)?._status
  const before = (previousDoc as Status | undefined)?._status
  const versioned = Boolean(collection.versions?.drafts)
  if (versioned && now !== 'published') {
    // never published, or a draft saved on top of a published doc (live content unchanged)
    const q = (req.query ?? {}) as Record<string, unknown>
    const draftSave = String(q.draft) === 'true' || String(q.autosave) === 'true'
    if (before !== 'published' || draftSave) return doc
  }
  scheduleDeploy(`${collection.slug}:${String(doc?.slug ?? doc?.id ?? '')}`, req)
  return doc
}

export const deployAfterDelete: CollectionAfterDeleteHook = ({ doc, collection, req }) => {
  scheduleDeploy(`${collection.slug}:${String(doc?.slug ?? doc?.id ?? '')} (deleted)`, req)
  return doc
}

export const deployAfterGlobalChange: GlobalAfterChangeHook = ({ doc, global, req }) => {
  scheduleDeploy(`global:${global.slug}`, req)
  return doc
}
