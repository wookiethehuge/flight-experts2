/**
 * Enquiry contract shared by the quote form, booking modal and contact form, and implemented by the CMS
 * (apps/cms `enquiries` collection, public create). POST JSON to `${endpoint}/api/enquiries`.
 */
export interface EnquiryLeg { from: string; to: string; date?: string }
export interface EnquiryPayload {
  kind: 'quote' | 'contact';
  /** contact form: which line the enquiry is for (default 'sales'). Drives routing in the CMS / CRM. */
  topic?: 'sales' | 'support';
  // quote
  tripType?: 'round-trip' | 'one-way' | 'multi-city';
  cabin?: 'business' | 'first' | 'premium-economy' | 'economy';
  travellers?: { adults: number; children: number; infants: number };
  legs?: EnquiryLeg[];           // leg 1 = outbound; round trip adds returnDate
  returnDate?: string;
  // person
  name?: string;                 // quote form: single "Name" field
  firstName?: string;            // contact form
  lastName?: string;
  email: string;
  phone?: string;                // required for kind 'quote'
  subject?: string;
  message?: string;
  smsConsent?: boolean;
  // meta + spam protection (validated server-side)
  pageUrl: string;
  hp: string;                    // honeypot, must be empty
  elapsedMs: number;             // time from render to submit, must be >= 2500
  turnstileToken?: string;
}

/** Build-time endpoint (public). Empty = no backend configured: forms simulate success in previews. */
export const FORMS_ENDPOINT = (import.meta.env.PUBLIC_FORMS_ENDPOINT || import.meta.env.PAYLOAD_URL || '').replace(/\/$/, '');
export const TURNSTILE_SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || '';
