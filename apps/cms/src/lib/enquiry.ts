/**
 * Server-side validation for public enquiry submissions. Mirrors `EnquiryPayload` in apps/web/src/lib/forms.ts.
 * `sanitizeEnquiry` whitelists known fields (unknown keys are dropped), trims strings, enforces types and length
 * limits, and applies per-kind required fields. Errors use Payload's `{ path, message }` shape so the site can show
 * them next to the right input.
 */

/** All enquiry kinds stored in the collection. 'chat' is created by the Jivo webhook only (never by the public API). */
export const KINDS = ['quote', 'contact', 'chat'] as const
/** Kinds the website forms may submit. */
export const PUBLIC_KINDS = ['quote', 'contact'] as const
export const TOPICS = ['sales', 'support'] as const
export const TRIP_TYPES = ['round-trip', 'one-way', 'multi-city'] as const
export const CABINS = ['business', 'first', 'premium-economy', 'economy'] as const

export const LIMITS = {
  name: 100,
  email: 254,
  phone: 40,
  subject: 200,
  message: 5000,
  place: 120,
  date: 40,
  pageUrl: 2000,
  legs: 6,
  travellers: 20,
} as const

export type FieldError = { path: string; message: string }

export interface CleanEnquiry {
  kind: (typeof PUBLIC_KINDS)[number]
  topic?: (typeof TOPICS)[number]
  tripType?: (typeof TRIP_TYPES)[number]
  cabin?: (typeof CABINS)[number]
  travellers?: { adults: number; children: number; infants: number }
  legs?: { from: string; to: string; date?: string }[]
  returnDate?: string
  name?: string
  firstName?: string
  lastName?: string
  email: string
  phone?: string
  subject?: string
  message?: string
  smsConsent: boolean
  pageUrl: string
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
const PHONE_RE = /^[+\d\s().\-/]{6,40}$/
// strip ASCII control characters (keep \n and \t in messages)
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function sanitizeEnquiry(raw: unknown): { data: CleanEnquiry; errors: FieldError[] } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: FieldError[] = []

  const str = (path: string, v: unknown, max: number, multiline = false): string | undefined => {
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'string' && typeof v !== 'number') {
      errors.push({ path, message: 'Invalid value.' })
      return undefined
    }
    let s = String(v).replace(CTRL_RE, '')
    s = multiline ? s.replace(/\r\n?/g, '\n').trim() : s.replace(/\s+/g, ' ').trim()
    if (s.length > max) errors.push({ path, message: `Please keep this under ${max} characters.` })
    return s || undefined
  }
  const oneOf = <T extends readonly string[]>(path: string, v: unknown, options: T): T[number] | undefined => {
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T[number]
    errors.push({ path, message: 'Please choose a valid option.' })
    return undefined
  }
  const count = (path: string, v: unknown, min: number): number => {
    if (v === undefined || v === null || v === '') return min
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > LIMITS.travellers) {
      errors.push({ path, message: `Enter a whole number between 0 and ${LIMITS.travellers}.` })
      return min
    }
    return n
  }
  const required = (path: string, v: unknown, message = 'This field is required.') => {
    if (v === undefined || v === null || v === '') errors.push({ path, message })
  }

  const kind = oneOf('kind', input.kind, PUBLIC_KINDS)
  if (!kind) required('kind', undefined, 'Unknown form type.')

  const data: CleanEnquiry = {
    kind: kind ?? 'contact',
    topic: oneOf('topic', input.topic, TOPICS),
    tripType: oneOf('tripType', input.tripType, TRIP_TYPES),
    cabin: oneOf('cabin', input.cabin, CABINS),
    returnDate: str('returnDate', input.returnDate, LIMITS.date),
    name: str('name', input.name, LIMITS.name),
    firstName: str('firstName', input.firstName, LIMITS.name),
    lastName: str('lastName', input.lastName, LIMITS.name),
    email: str('email', input.email, LIMITS.email)?.toLowerCase() ?? '',
    phone: str('phone', input.phone, LIMITS.phone),
    subject: str('subject', input.subject, LIMITS.subject),
    message: str('message', input.message, LIMITS.message, true),
    smsConsent: input.smsConsent === true || input.smsConsent === 'true' || input.smsConsent === 'on',
    pageUrl: str('pageUrl', input.pageUrl, LIMITS.pageUrl) ?? '',
  }

  // travellers
  if (input.travellers !== undefined && input.travellers !== null) {
    const t = (typeof input.travellers === 'object' ? input.travellers : {}) as Record<string, unknown>
    data.travellers = {
      adults: count('travellers.adults', t.adults, 1),
      children: count('travellers.children', t.children, 0),
      infants: count('travellers.infants', t.infants, 0),
    }
    if (data.travellers.adults + data.travellers.children + data.travellers.infants > LIMITS.travellers)
      errors.push({ path: 'travellers', message: `For groups over ${LIMITS.travellers}, please call us.` })
  }

  // legs: drop completely empty rows (except the first), validate the rest
  if (input.legs !== undefined && input.legs !== null) {
    if (!Array.isArray(input.legs)) errors.push({ path: 'legs', message: 'Invalid flights.' })
    else {
      if (input.legs.length > LIMITS.legs) errors.push({ path: 'legs', message: `Up to ${LIMITS.legs} flights per request.` })
      const legs: { from: string; to: string; date?: string }[] = []
      input.legs.slice(0, LIMITS.legs).forEach((leg, i) => {
        const l = (leg && typeof leg === 'object' ? leg : {}) as Record<string, unknown>
        const from = str(`legs.${i}.from`, l.from, LIMITS.place)
        const to = str(`legs.${i}.to`, l.to, LIMITS.place)
        const date = str(`legs.${i}.date`, l.date, LIMITS.date)
        if (i > 0 && !from && !to && !date) return
        if (i > 0) {
          required(`legs.${i}.from`, from, 'Where are you flying from?')
          required(`legs.${i}.to`, to, 'Where are you flying to?')
        }
        legs.push({ from: from ?? '', to: to ?? '', ...(date ? { date } : {}) })
      })
      data.legs = legs
    }
  }

  // format checks
  if (data.email && !EMAIL_RE.test(data.email)) errors.push({ path: 'email', message: 'Please enter a valid email address.' })
  const digits = (data.phone ?? '').replace(/\D/g, '').length
  if (data.phone && (!PHONE_RE.test(data.phone) || digits < 7 || digits > 15)) errors.push({ path: 'phone', message: 'Please enter a valid phone number.' })

  // required per kind
  required('email', data.email, 'Please enter your email address.')
  if (data.kind === 'quote') {
    const first = data.legs?.[0]
    required('legs.0.from', first?.from, 'Where are you flying from?')
    required('legs.0.to', first?.to, 'Where are you flying to?')
    required('legs.0.date', first?.date, 'When do you want to fly?')
    required('phone', data.phone, 'Please enter your phone number.')
    delete data.topic
  } else if (data.kind === 'contact') {
    required('firstName', data.firstName, 'Please enter your first name.')
    data.topic ??= 'sales'
    if (!data.message && !data.subject) errors.push({ path: 'message', message: 'Please tell us how we can help.' })
  }

  // de-duplicate errors by path (first message wins)
  const seen = new Set<string>()
  const unique = errors.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))

  // drop undefined keys
  for (const k of Object.keys(data) as (keyof CleanEnquiry)[]) if (data[k] === undefined) delete data[k]
  return { data, errors: unique }
}

/** Display name for admin lists. */
export const enquiryDisplayName = (d: Partial<CleanEnquiry>) =>
  d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Enquiry'
