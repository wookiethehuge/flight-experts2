/**
 * Client helper for submitting enquiries. Usage in a component <script>:
 *   import { submitEnquiry, startTimer } from '../../scripts/enquiry';
 *   const t0 = startTimer(); ... const res = await submitEnquiry(form, payload, t0);
 * The form element must carry data-endpoint (set from FORMS_ENDPOINT at build) and contain the honeypot input
 * <input name="company_website" ...> rendered by <Honeypot/>.
 */
import type { EnquiryPayload } from '../lib/forms';

export const startTimer = () => performance.now();

export type SubmitResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function submitEnquiry(form: HTMLFormElement, data: Omit<EnquiryPayload, 'pageUrl' | 'hp' | 'elapsedMs'>, t0: number): Promise<SubmitResult> {
  const endpoint = form.dataset.endpoint || '';
  const hp = (form.querySelector<HTMLInputElement>('input[name="company_website"]')?.value ?? '').trim();
  const turnstileToken = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value;
  const payload: EnquiryPayload = { ...data, pageUrl: location.href, hp, elapsedMs: Math.round(performance.now() - t0), turnstileToken } as EnquiryPayload;
  if (!endpoint) {
    console.warn('[enquiry] No forms endpoint configured; simulating success.', payload);
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true };
  }
  try {
    const res = await fetch(`${endpoint}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const fieldErrors: Record<string, string> = {};
    for (const e of body?.errors ?? []) for (const d of e?.data?.errors ?? []) if (d.path) fieldErrors[d.path] = d.message;
    return { ok: false, message: res.status === 429 ? 'Too many requests. Please wait a minute and try again, or call us.' : 'Something went wrong sending your request. Please try again or call us.', fieldErrors };
  } catch {
    return { ok: false, message: 'We could not reach our server. Check your connection and try again, or call us.' };
  }
}

export const THANK_YOU_URL = '/thank-you/';

/**
 * Phone / email exactly as browsers and password managers autofill them can hold look-alike characters the checks
 * (and the CMS) reject: non-breaking hyphens and dashes (Apple Contacts saves 555-0132 with U+2011), full-width digits, "/" separators,
 * zero-width marks. Rewrites tel / email inputs to plain characters when they change (autofill fires change) and
 * right before the form's own submit handler. Call once per form, before adding the submit listener.
 */
export const cleanPhone = (v: string) =>
  v.normalize('NFKC').replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-').replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
export const cleanEmail = (v: string) => v.normalize('NFKC').replace(/[\s\u200b-\u200d\u2060\ufeff]/g, '');
export function tidyContactFields(form: HTMLFormElement) {
  const tidy = (el: Element | null) => {
    if (!(el instanceof HTMLInputElement)) return;
    const v = el.type === 'tel' ? cleanPhone(el.value) : el.type === 'email' ? cleanEmail(el.value) : el.value;
    if (v !== el.value) el.value = v;
  };
  form.addEventListener('change', (e) => tidy(e.target as Element), true);
  form.addEventListener('submit', () => form.querySelectorAll('input[type="tel"], input[type="email"]').forEach(tidy), true);
}
