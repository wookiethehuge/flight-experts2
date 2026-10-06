import { timingSafeEqual } from 'node:crypto'
import type { Endpoint, PayloadRequest } from 'payload'
import { LIMITS } from '../lib/enquiry'

/**
 * POST /api/jivo-webhook?secret=<JIVO_WEBHOOK_SECRET>
 *
 * Receives Jivo "CRM webhooks" (https://www.jivochat.com/docs/webhooks/) and turns chat leads into enquiries
 * (kind 'chat'), which are then forwarded to the CRM / emailed by the normal enquiry afterChange hook.
 *   - offline_message: the out-of-hours form (or AI agent hand-off) -> one enquiry with the visitor's message
 *   - chat_finished  : a finished chat -> one enquiry with the visitor's details and the transcript
 * Other events are acknowledged and ignored. Jivo does not sign webhooks, so the URL carries a shared secret
 * (query `secret`, or header `X-Jivo-Secret` when a proxy adds it). Jivo expects `{"result":"ok"}`.
 * Chats without any contact detail (no email and no phone) are acknowledged but not stored.
 * Duplicates (Jivo retries) are skipped by `meta.externalId` = `jivo:<event>:<chat or message id>`.
 */

const ok = (extra: Record<string, unknown> = {}) => Response.json({ result: 'ok', ...extra })
const fail = (status: number, error: string) => Response.json({ result: error }, { status })

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const clip = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return s ? s.slice(0, max) : undefined
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type JivoMessage = { message?: string; timestamp?: number; type?: string }
type JivoBody = {
  event_name?: string
  chat_id?: number | string
  offline_message_id?: number | string
  message?: string
  visitor?: { name?: string; email?: string; phone?: string; description?: string }
  page?: { url?: string; title?: string }
  chat?: { messages?: JivoMessage[] }
}

/** Build the enquiry data for a Jivo event, or null when the event is not a lead. Exported for tests. */
export function enquiryFromJivo(body: JivoBody) {
  const event = body.event_name
  if (event !== 'offline_message' && event !== 'chat_finished') return null
  const v = body.visitor ?? {}
  const email = clip(v.email, LIMITS.email)?.toLowerCase()
  const phone = clip(v.phone, LIMITS.phone)
  let message: string | undefined
  if (event === 'offline_message') message = clip(body.message, LIMITS.message)
  else {
    const lines = (body.chat?.messages ?? [])
      .filter((m) => typeof m?.message === 'string' && m.message.trim())
      .map((m) => `${m.type === 'agent' ? 'Agent' : m.type === 'visitor' ? 'Visitor' : m.type ?? 'System'}: ${m.message!.trim()}`)
    message = clip(lines.join('\n'), LIMITS.message)
  }
  const description = clip(v.description, 1000)
  if (description) message = clip(`${message ?? ''}${message ? '\n\n' : ''}Visitor note: ${description}`, LIMITS.message)
  const ref = event === 'offline_message' ? (body.offline_message_id ?? body.chat_id) : body.chat_id
  return {
    kind: 'chat' as const,
    name: clip(v.name, LIMITS.name),
    email: email && EMAIL_RE.test(email) ? email : undefined,
    phone,
    subject: event === 'offline_message' ? 'Chat: offline message' : 'Chat: conversation finished',
    message,
    smsConsent: false,
    pageUrl: clip(body.page?.url, LIMITS.pageUrl),
    externalId: ref !== undefined && ref !== null ? `jivo:${event}:${ref}` : undefined,
  }
}

async function handler(req: PayloadRequest): Promise<Response> {
  const secret = process.env.JIVO_WEBHOOK_SECRET
  if (!secret) return fail(503, 'Jivo webhook is not configured (JIVO_WEBHOOK_SECRET).')
  const url = new URL(req.url ?? '/', 'http://localhost')
  const given = url.searchParams.get('secret') ?? req.headers.get('x-jivo-secret') ?? ''
  if (!safeEqual(given, secret)) {
    req.payload.logger.warn('[jivo] webhook with a wrong secret')
    return fail(401, 'Unauthorized')
  }

  let body: JivoBody
  try {
    body = ((typeof req.json === 'function' ? await req.json() : req.data) ?? {}) as JivoBody
  } catch {
    return fail(400, 'Invalid JSON')
  }
  if (!body || typeof body !== 'object') return fail(400, 'Invalid JSON')

  const lead = enquiryFromJivo(body)
  if (!lead) return ok({ ignored: body.event_name ?? 'unknown' })
  if (!lead.email && !lead.phone) {
    req.payload.logger.info(`[jivo] ${body.event_name} ${body.chat_id ?? ''} without contact details: not stored`)
    return ok({ stored: false })
  }

  const { externalId, ...data } = lead
  if (externalId) {
    const dupe = await req.payload.find({
      collection: 'enquiries',
      where: { 'meta.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (dupe.docs[0]) return ok({ duplicate: true })
  }

  try {
    const doc = await req.payload.create({
      collection: 'enquiries',
      data: {
        ...data,
        status: 'new',
        meta: {
          externalId,
          origin: 'jivo',
          userAgent: 'Jivo webhook',
          crmStatus: process.env.CRM_WEBHOOK_URL ? 'pending' : 'skipped',
        },
      },
      overrideAccess: true,
    })
    req.payload.logger.info(`[jivo] ${body.event_name} stored as enquiry #${doc.id}`)
    return ok({ stored: true, id: doc.id })
  } catch (err) {
    req.payload.logger.error(`[jivo] could not store ${body.event_name}: ${(err as Error).message}`)
    return fail(500, 'Could not store the lead')
  }
}

export const jivoWebhook: Endpoint = { path: '/jivo-webhook', method: 'post', handler }
