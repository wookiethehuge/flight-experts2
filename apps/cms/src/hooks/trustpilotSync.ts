import { createHash, timingSafeEqual } from 'node:crypto'
import type { Endpoint, Payload, PayloadRequest } from 'payload'
import { scheduleDeploy } from './deployHook'

/**
 * POST /api/trustpilot-sync
 *
 * Receives the daily batch of Trustpilot reviews from the scraper (Apify actor) and upserts them into
 * `testimonials` by `reviewId`. Documented in apps/cms/README.md > "Trustpilot sync".
 *
 *   Auth   : `Authorization: Bearer <TRUSTPILOT_SYNC_SECRET>` or `x-sync-secret: <secret>` (401 / 503 when unset)
 *   Body   : `{ actorRunId?, datasetId?, reviews: Review[] }` or a bare `Review[]`; <= 200 reviews, <= 1 MB (413)
 *   Create : source 'trustpilot', approved FALSE (editors approve in the admin)
 *   Update : only the synced content fields (+ lastSyncedAt, raw); approved / order / source are never touched
 *   Result : 200 { ok, received, created, updated, unchanged, skipped, errors[], actorRunId?, datasetId? }
 * Invalid reviews are skipped and reported; they never fail the batch. One debounced site rebuild when anything
 * was created or updated.
 */

export const MAX_REVIEWS = 200
export const MAX_BYTES = 1_000_000

const LIMITS = { reviewId: 200, name: 120, title: 200, body: 5000, url: 2000, country: 60, language: 20, reply: 5000, ref: 120 }

// ------------------------------------------------------------------ helpers
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** First non-empty value among dotted paths ('consumer.displayName'). */
function pick(src: Obj, paths: string[]): unknown {
  for (const p of paths) {
    let v: unknown = src
    for (const k of p.split('.')) v = isObj(v) ? v[k] : undefined
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** Plain text: HTML stripped (line breaks kept), entities decoded, control chars removed, whitespace tidied, capped. */
export function cleanText(v: unknown, max: number, multiline = false): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v)
  if (typeof v !== 'string') return undefined
  let s = v
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  s = decode(s)
    .replace(/<[^>]*>/g, '') // tags that were entity-encoded
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  s = multiline
    ? s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n')
    : s.replace(/\s+/g, ' ')
  s = s.trim()
  if (!s) return undefined
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

function cleanRating(v: unknown): number | undefined {
  if (isObj(v)) v = pick(v, ['value', 'ratingValue', 'stars'])
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? '') : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r >= 1 && r <= 5 ? r : undefined
}

function cleanDate(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  let d: Date
  if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v) // seconds or milliseconds
  else if (typeof v === 'string') d = new Date(/^\d{9,13}$/.test(v) ? Number(v) * (v.length <= 10 ? 1000 : 1) : v)
  else return undefined
  const t = d.getTime()
  // sanity window: Trustpilot launched 2007; allow a day of clock skew
  return Number.isFinite(t) && t > Date.UTC(2007, 0, 1) && t < Date.now() + 86_400_000 ? d.toISOString() : undefined
}

function cleanUrl(v: unknown): string | undefined {
  const s = cleanText(v, LIMITS.url)
  if (!s) return undefined
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

/** Title from the first sentence of the body when the review has none. */
const titleFromBody = (body: string) => {
  const first = body.split(/(?<=[.!?])\s|\n/)[0] ?? body
  return cleanText(first, 80) ?? cleanText(body, 80)!
}

// ------------------------------------------------------------------ mapping
export type SyncedReview = {
  reviewId: string
  rating: number
  name: string
  title: string
  body: string | null
  reviewDate: string | null
  reviewUrl: string | null
  country: string | null
  language: string | null
  replyText: string | null
}
/** Fields the sync owns (compared to detect changes, written on update). */
const SYNCED: (keyof SyncedReview)[] = ['name', 'title', 'body', 'rating', 'reviewDate', 'reviewUrl', 'country', 'language', 'replyText']

/** Map one scraper item (Trustpilot / Apify shapes) to testimonial fields. Throws a readable message when invalid. */
export function mapReview(item: unknown): SyncedReview {
  if (!isObj(item)) throw new Error('Review must be an object')
  const reviewId = cleanText(pick(item, ['reviewId', 'review_id', 'id', 'review.id']), LIMITS.reviewId)
  if (!reviewId) throw new Error('Missing reviewId (id / reviewId / review_id)')

  const rawRating = pick(item, ['rating', 'stars', 'score', 'ratingValue', 'reviewRating.ratingValue', 'review.rating'])
  const rating = cleanRating(rawRating)
  if (rating === undefined)
    throw new Error(rawRating === undefined ? 'Missing rating (rating / stars / score)' : 'rating must be a number from 1 to 5')

  let title = cleanText(pick(item, ['title', 'reviewTitle', 'headline', 'review.title']), LIMITS.title)
  const body = cleanText(pick(item, ['text', 'body', 'content', 'reviewBody', 'reviewText', 'review.text']), LIMITS.body, true)
  if (!title && !body) throw new Error('Missing text: needs a body (text / body / content / reviewBody) or a title')
  if (!title) title = titleFromBody(body!)

  let author = pick(item, ['author', 'name', 'consumerName', 'reviewer', 'consumer.displayName', 'consumer.name', 'authorName', 'userName'])
  if (isObj(author)) author = pick(author, ['displayName', 'name'])
  const name = cleanText(author, LIMITS.name) ?? 'Trustpilot customer'

  let reply = pick(item, ['replyText', 'reply', 'companyReply', 'response', 'review.reply'])
  if (isObj(reply)) reply = pick(reply, ['text', 'message', 'body', 'content'])

  return {
    reviewId,
    rating,
    name,
    title,
    body: body ?? null,
    reviewDate:
      cleanDate(
        pick(item, ['date', 'publishedDate', 'datePublished', 'createdAt', 'dates.publishedDate', 'review.dates.publishedDate', 'experienceDate', 'dates.experiencedDate']),
      ) ?? null,
    reviewUrl: cleanUrl(pick(item, ['url', 'reviewUrl', 'link', 'review_url'])) ?? null,
    country: cleanText(pick(item, ['country', 'countryCode', 'consumer.countryCode', 'consumer.country', 'location']), LIMITS.country) ?? null,
    language: cleanText(pick(item, ['language', 'lang', 'languageCode']), LIMITS.language) ?? null,
    replyText: cleanText(reply, LIMITS.reply, true) ?? null,
  }
}

const norm = (k: keyof SyncedReview, v: unknown) => {
  if (v === undefined || v === null || v === '') return null
  if (k === 'reviewDate') return new Date(v as string).getTime()
  return v
}
/** Synced fields that differ from the stored document (a known date is never cleared by a batch without one). */
const changedFields = (doc: Obj, next: SyncedReview) =>
  SYNCED.filter((k) => !(k === 'reviewDate' && next.reviewDate === null) && norm(k, doc[k]) !== norm(k, next[k]))

// ------------------------------------------------------------------ auth + body
const digest = (s: string) => createHash('sha256').update(s).digest()
/** Constant time, also for different lengths (compares digests). */
const safeEqual = (given: string, secret: string) => given.length > 0 && timingSafeEqual(digest(given), digest(secret))

function authorised(req: PayloadRequest, secret: string) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1]?.trim() ?? ''
  const header = (req.headers.get('x-sync-secret') ?? '').trim()
  // evaluate both so timing does not reveal which header was used
  const a = safeEqual(bearer, secret)
  const b = safeEqual(header, secret)
  return a || b
}

class TooLarge extends Error {}

/** Read the raw body with a hard byte cap (streams, so an oversized upload is cut off early). */
async function readBody(req: PayloadRequest): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new TooLarge()
  const stream = (req as unknown as Request).body
  if (stream && typeof (stream as ReadableStream).getReader === 'function') {
    const reader = (stream as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {})
        throw new TooLarge()
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  if (typeof req.text === 'function') {
    const text = await req.text()
    if (Buffer.byteLength(text) > MAX_BYTES) throw new TooLarge()
    return text
  }
  const text = JSON.stringify(req.data ?? null)
  if (Buffer.byteLength(text) > MAX_BYTES) throw new TooLarge()
  return text
}

// ------------------------------------------------------------------ sync
type SyncError = { index: number; reviewId?: string; message: string }
export type SyncResult = {
  ok: true
  received: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: SyncError[]
  actorRunId?: string
  datasetId?: string
}

const context = { disableDeployHook: true } // one rebuild for the whole batch, scheduled below

/** Upsert a batch of scraper items. Exported for scripts/tests. */
export async function syncReviews(payload: Payload, items: unknown[]): Promise<Omit<SyncResult, 'ok'>> {
  const res = { received: items.length, created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] as SyncError[] }
  const now = new Date().toISOString()

  // sequential on purpose: small batches, and a reviewId repeated in one batch must update, not race a create
  for (const [index, item] of items.entries()) {
    let review: SyncedReview
    try {
      review = mapReview(item)
    } catch (err) {
      const id = isObj(item) ? cleanText(pick(item, ['reviewId', 'review_id', 'id']), LIMITS.reviewId) : undefined
      res.skipped++
      res.errors.push({ index, ...(id ? { reviewId: id } : {}), message: (err as Error).message })
      continue
    }
    try {
      const found = await payload.find({
        collection: 'testimonials',
        where: { reviewId: { equals: review.reviewId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const existing = found.docs[0] as unknown as Obj | undefined
      if (!existing) {
        await payload.create({
          collection: 'testimonials',
          data: { ...review, source: 'trustpilot', approved: false, order: 0, lastSyncedAt: now, raw: item as Obj },
          overrideAccess: true,
          depth: 0,
          context,
        })
        res.created++
        continue
      }
      const changed = changedFields(existing, review)
      const data: Obj = { lastSyncedAt: now, raw: item as Obj }
      for (const k of changed) data[k] = review[k]
      await payload.update({
        collection: 'testimonials',
        id: existing.id as number | string,
        data,
        overrideAccess: true,
        depth: 0,
        context,
      })
      changed.length ? res.updated++ : res.unchanged++
    } catch (err) {
      res.skipped++
      res.errors.push({ index, reviewId: review.reviewId, message: `Could not save: ${(err as Error).message}`.slice(0, 300) })
    }
  }
  return res
}

const json = (status: number, body: Obj) => Response.json(body, { status })
const fail = (status: number, error: string) => json(status, { ok: false, error })

async function handler(req: PayloadRequest): Promise<Response> {
  const secret = process.env.TRUSTPILOT_SYNC_SECRET
  if (!secret) return fail(503, 'Trustpilot sync is not configured (TRUSTPILOT_SYNC_SECRET).')
  if (!authorised(req, secret)) {
    req.payload.logger.warn('[trustpilot-sync] rejected: missing or wrong secret')
    return fail(401, 'Unauthorized')
  }

  let text: string
  try {
    text = await readBody(req)
  } catch (err) {
    if (err instanceof TooLarge) return fail(413, `Body too large (max ${MAX_BYTES} bytes).`)
    return fail(400, 'Could not read the request body.')
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return fail(400, 'Invalid JSON.')
  }

  const items = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.reviews) ? body.reviews : null
  if (!items) return fail(400, 'Expected { "reviews": [...] } or an array of reviews.')
  if (items.length > MAX_REVIEWS) return fail(413, `Too many reviews (${items.length}); send at most ${MAX_REVIEWS} per request.`)

  const actorRunId = isObj(body) ? cleanText(body.actorRunId, LIMITS.ref) : undefined
  const datasetId = isObj(body) ? cleanText(body.datasetId, LIMITS.ref) : undefined

  const started = Date.now()
  const result = await syncReviews(req.payload, items)
  if (result.created || result.updated)
    scheduleDeploy(`trustpilot-sync: ${result.created} created, ${result.updated} updated`, req)

  req.payload.logger.info(
    `[trustpilot-sync] run=${actorRunId ?? '-'} dataset=${datasetId ?? '-'} received=${result.received} ` +
      `created=${result.created} updated=${result.updated} unchanged=${result.unchanged} skipped=${result.skipped} ` +
      `(${Date.now() - started} ms)`,
  )

  const out: SyncResult = { ok: true, ...result }
  if (actorRunId) out.actorRunId = actorRunId
  if (datasetId) out.datasetId = datasetId
  return json(200, out)
}

export const trustpilotSync: Endpoint = { path: '/trustpilot-sync', method: 'post', handler }
