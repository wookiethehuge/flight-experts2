import { createHmac } from 'node:crypto'
import {
  APIError,
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type Payload,
} from 'payload'
import { enquiryDisplayName, sanitizeEnquiry } from '../lib/enquiry'
import { int, serverUrl } from '../lib/env'
import { clientIp, rateLimit } from '../lib/rateLimit'
import { verifyTurnstile } from '../lib/turnstile'
import { background } from '../lib/background'

/** Minimum time between form render and submit (ms). Faster = bot. */
export const MIN_ELAPSED_MS = 2500

const reject = (message: string, status = 400) => new APIError(message, status, null, true)

/**
 * Guards PUBLIC creates (REST/GraphQL without a signed-in user). Staff creating enquiries in the admin and
 * server-side (Local API) calls are not affected.
 *
 * Order: rate limit (429) -> honeypot / timing (400, nothing stored) -> Turnstile (400) -> field validation
 * (400 ValidationError with per-field errors) -> replace the body with the whitelisted, cleaned data.
 */
export const guardPublicEnquiry: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'create') return args
  if (req.user || req.payloadAPI === 'local') return args

  const ip = clientIp(req.headers)
  const limit = rateLimit(`enquiry:${ip}`, int(process.env.ENQUIRY_RATE_LIMIT, 5), int(process.env.ENQUIRY_RATE_WINDOW_MS, 60_000))
  if (!limit.ok) {
    req.payload.logger.warn(`[enquiries] rate limited ${ip}`)
    throw reject(`Too many requests. Please try again in ${limit.retryAfter} seconds.`, 429)
  }

  const raw = (args.data ?? {}) as Record<string, unknown>

  // spam traps: store nothing, answer 400
  const hp = raw.hp
  if (hp !== undefined && hp !== null && String(hp).trim() !== '') {
    req.payload.logger.warn(`[enquiries] honeypot filled from ${ip}`)
    throw reject('Submission rejected.')
  }
  const elapsed = Number(raw.elapsedMs)
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) {
    req.payload.logger.warn(`[enquiries] submitted too fast (${String(raw.elapsedMs)}ms) from ${ip}`)
    throw reject('Submission rejected. Please take a moment and try again.')
  }

  if (!(await verifyTurnstile(raw.turnstileToken as string | undefined, ip, (m) => req.payload.logger.warn(m)))) {
    throw new ValidationError({
      collection: 'enquiries',
      errors: [{ path: 'turnstileToken', message: 'Please complete the security check and try again.' }],
      req,
    })
  }

  const { data, errors } = sanitizeEnquiry(raw)
  if (errors.length) throw new ValidationError({ collection: 'enquiries', errors, req })

  ;(args as { data: unknown }).data = {
    ...data,
    status: 'new',
    meta: {
      ip,
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 400),
      origin: (req.headers.get('origin') ?? '').slice(0, 200),
      crmStatus: process.env.CRM_WEBHOOK_URL ? 'pending' : 'skipped',
    },
  }
  return args
}

export const setDisplayName: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  data.displayName = enquiryDisplayName({ ...(originalDoc ?? {}), ...data })
  return data
}

// ------------------------------------------------------------------ after create: CRM + email
type EnquiryDoc = Record<string, any> & { id: number | string }

/** JSON sent to CRM_WEBHOOK_URL (documented in README). */
export function crmPayload(doc: EnquiryDoc) {
  const { meta, notes: _notes, status: _status, displayName: _dn, updatedAt: _u, ...rest } = doc
  const base = serverUrl()
  return {
    event: 'enquiry.created',
    source: 'flight-experts-cms',
    id: doc.id,
    createdAt: doc.createdAt,
    adminUrl: base ? `${base}/admin/collections/enquiries/${doc.id}` : undefined,
    enquiry: {
      ...rest,
      id: undefined,
      createdAt: undefined,
      legs: Array.isArray(rest.legs) ? rest.legs.map(({ id: _id, ...leg }: Record<string, unknown>) => leg) : rest.legs,
    },
    meta: { ip: meta?.ip, userAgent: meta?.userAgent, origin: meta?.origin },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function postWithRetry(url: string, body: string, headers: Record<string, string>, attempts: number) {
  let last = ''
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(int(process.env.CRM_WEBHOOK_TIMEOUT_MS, 8000)) })
      if (res.ok) return { ok: true as const, status: res.status }
      last = `HTTP ${res.status}`
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break // not retryable
    } catch (err) {
      last = (err as Error).message
    }
    if (i < attempts - 1) await sleep(1000 * 3 ** i) // 1s, 3s, 9s ...
  }
  return { ok: false as const, error: last }
}

async function updateMeta(payload: Payload, id: EnquiryDoc['id'], meta: Record<string, unknown>) {
  for (let i = 0; i < 3; i++) {
    try {
      const current = await payload.findByID({ collection: 'enquiries', id, depth: 0, overrideAccess: true })
      await payload.update({
        collection: 'enquiries',
        id,
        data: { meta: { ...(current?.meta ?? {}), ...meta } },
        overrideAccess: true,
        context: { skipEnquiryNotify: true },
      })
      return
    } catch {
      await sleep(500 * (i + 1))
    }
  }
}

async function forwardToCrm(payload: Payload, doc: EnquiryDoc) {
  const url = process.env.CRM_WEBHOOK_URL
  if (!url) return
  const body = JSON.stringify(crmPayload(doc))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'FlightExperts-CMS/1.0',
    'X-Flight-Experts-Event': 'enquiry.created',
  }
  const secret = process.env.CRM_WEBHOOK_SECRET
  if (secret) headers['X-Flight-Experts-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  if (process.env.CRM_WEBHOOK_AUTH) headers.Authorization = process.env.CRM_WEBHOOK_AUTH
  const result = await postWithRetry(url, body, headers, int(process.env.CRM_WEBHOOK_ATTEMPTS, 3))
  if (result.ok) payload.logger.info(`[enquiries] #${doc.id} forwarded to CRM (${result.status})`)
  else payload.logger.error(`[enquiries] #${doc.id} CRM webhook failed: ${result.error}`)
  await updateMeta(payload, doc.id, result.ok ? { crmStatus: 'sent', crmError: null } : { crmStatus: 'failed', crmError: result.error.slice(0, 300) })
}

async function notifyByEmail(payload: Payload, doc: EnquiryDoc) {
  const to = process.env.ENQUIRY_NOTIFY_TO
  if (!to || !process.env.SMTP_HOST) return
  const lines: string[] = [
    `New ${doc.kind} enquiry from ${doc.displayName ?? doc.email}`,
    '',
    doc.topic ? `Inquiry type: ${doc.topic}` : '',
    doc.email ? `Email: ${doc.email}` : '',
    doc.phone ? `Phone: ${doc.phone}` : '',
    doc.tripType ? `Trip: ${doc.tripType}${doc.cabin ? `, ${doc.cabin}` : ''}` : '',
    doc.travellers ? `Travellers: ${doc.travellers.adults ?? 0} adults, ${doc.travellers.children ?? 0} children, ${doc.travellers.infants ?? 0} infants` : '',
    ...((doc.legs ?? []) as { from: string; to: string; date?: string }[]).map((l, i) => `Flight ${i + 1}: ${l.from} -> ${l.to}${l.date ? ` on ${l.date}` : ''}`),
    doc.returnDate ? `Return: ${doc.returnDate}` : '',
    doc.subject ? `Subject: ${doc.subject}` : '',
    doc.message ? `\n${doc.message}\n` : '',
    `Page: ${doc.pageUrl ?? ''}`,
    serverUrl() ? `Open: ${serverUrl()}/admin/collections/enquiries/${doc.id}` : '',
  ].filter((l) => l !== '')
  try {
    await payload.sendEmail({
      to,
      subject: `New ${doc.kind === 'quote' ? 'quote request' : doc.kind === 'chat' ? 'live chat lead' : `${doc.topic ?? 'contact'} enquiry`}: ${doc.displayName ?? doc.email ?? doc.phone}`,
      text: lines.join('\n'),
      replyTo: doc.email || undefined,
    })
  } catch (err) {
    payload.logger.error(`[enquiries] notification email failed: ${(err as Error).message}`)
  }
}

/** Fire-and-forget: never delays or fails the visitor's request. */
export const notifyEnquiry: CollectionAfterChangeHook = ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context?.skipEnquiryNotify) return doc
  const { payload } = req
  const id = (doc as EnquiryDoc).id
  // after the create transaction has committed, re-read the full document (incl. staff-only fields)
  // background(): kept alive after the response on serverless hosts (Vercel), see lib/background.ts
  background(
    sleep(250).then(async () => {
      let full: EnquiryDoc = doc as EnquiryDoc
      try {
        full = (await payload.findByID({ collection: 'enquiries', id, depth: 0, overrideAccess: true })) as EnquiryDoc
      } catch {
        /* fall back to the hook doc */
      }
      await Promise.allSettled([forwardToCrm(payload, full), notifyByEmail(payload, full)])
    }),
  )
  return doc
}
