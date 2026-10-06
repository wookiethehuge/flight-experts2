/**
 * Content contract between Payload (apps/cms) and the Astro site (apps/web).
 * Shapes match Payload's REST API responses at depth=2. The seed JSON in src/content/seed uses the same shapes,
 * so the site builds with or without a running CMS.
 *
 * Inline text convention for editor-typed strings marked `Inline`: *italic*, **bold**, [label](url), and a line break
 * with a newline. Rendered by lib/inline.ts. (Rich text fields use Payload's Lexical JSON, rendered by lib/richtext.ts.)
 */

export type Inline = string;

export interface Media {
  id?: string | number;
  /** '/seed/<file>' for seed assets (resolved from src/assets/seed), or a CMS URL ('/api/media/file/...' or absolute). */
  url: string;
  alt: string;
  width?: number;
  height?: number;
  filename?: string;
  mimeType?: string;
}

export interface Link { label: string; href: string; }

export interface Seo {
  title?: string;
  description?: string;
  image?: Media | null;
  canonical?: string;
  noindex?: boolean;
}

/** Lexical editor state (Payload richText). */
export interface RichText { root: { type: 'root'; children: any[]; [k: string]: any } }

// ---------------------------------------------------------------- globals
export interface SiteSettings {
  phone: { display: string; href: string };                 // "(888) 855-2389", "tel:+18888552389"
  /** Per-line contact data (Contact page details card + inquiry-type toggle). */
  salesPhone: { display: string; href: string };
  supportPhone: { display: string; href: string };
  salesEmail: string;                                        // experts@flight-experts.com
  supportEmail: string;                                      // cs@flight-experts.com
  phoneFull: string;                                         // "+1 (888) 855-2389" (footer)
  email: string;                                             // cs@flight-experts.com
  enquiriesEmail: string;                                    // experts@flight-experts.com
  address: string;
  whatsappUrl: string;
  socials: { facebook?: string; linkedin?: string; instagram?: string };
  headerPhoneLabel: string;                                  // "24/7 PHONE DEALS"
  callPill: { title: string; subtitle: string };             // "CALL US: (888) 855-2389" / "Phone-exclusive savings"
  trustpilot: { rating: string; url?: string };              // "4.9/5.0"
  accreditations: { name: string; logo: Media; url?: string }[];
  paymentMethods: Media;
  footerVision: string;
  copyright: string;
  disclaimers: string[];
  menuContacts: { label: string; value: string; href: string }[];
  blogCta: { heading: Inline; body: string; primaryLabel: string; secondaryLabel: string };
  /** One-line consent / privacy note under the quote and contact form buttons (Inline: links allowed). */
  consentNote: Inline;
  /** Live chat. provider 'none' = the sticky chat button opens a small built-in panel (WhatsApp, call, quote form). */
  chat?: ChatSettings | null;
}

export interface ChatSettings {
  provider: 'none' | 'jivo';
  /** Jivo widget id: the last part of the script URL //code.jivosite.com/widget/<id> */
  jivoWidgetId?: string | null;
  /** Informational (agents' real schedules live in Jivo). Used to label the chat button before Jivo has loaded. */
  businessHours?: { timezone?: string | null; days?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[] | null; open?: string | null; close?: string | null } | null;
  /** Optional line shown in the built-in chat panel. */
  note?: string | null;
}

export interface Navigation {
  menu: Link[];          // hamburger menu items
  footer: Link[];        // "Useful links"
}

// ---------------------------------------------------------------- collections
/**
 * Customer review. `source: 'trustpilot'` ones are synced daily by the CMS (POST /api/trustpilot-sync) and only shown
 * once an editor approves them. `body` can be empty for a synced title-only review.
 */
export interface Testimonial {
  id?: string | number;
  name: string;
  title: string;
  body?: string | null;
  rating: number;
  order?: number | null;
  source?: 'manual' | 'trustpilot' | null;
  approved?: boolean | null;
  reviewId?: string | null;
  reviewDate?: string | null;   // ISO date
  reviewUrl?: string | null;
  country?: string | null;
  language?: string | null;
  replyText?: string | null;
}

export interface Author {
  id?: string | number;
  name: string;
  slug: string;
  role: string;
  photo: Media;
  bioIntro: string;
  quote?: string;
  bioMore?: string;
  expertise: { label: string }[];
  linkedin?: string;
  x?: string;
  seo?: Seo;
}

export interface Post {
  id?: string | number;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;          // ISO date
  readTime: number;             // minutes
  heroImage: Media;
  cardImage?: Media | null;     // optional different crop for cards
  author: Author;
  content: RichText;
  seo?: Seo;
  /** Optional art direction reproducing the design's framing with CSS only (the image file is never edited). */
  art?: PostArt | null;
}

export interface PostArt {
  /** Region of the card image shown in the 3:2 card, as % of the image: top-left x/y and width w (100 = full width). */
  cardCrop?: { x: number; y: number; w: number } | null;
  /** Navy gradient over the card image (as on the airport-silhouettes photo in the design). */
  cardShade?: boolean;
  /** CSS object-position for the article hero, e.g. "100% 71%" (applied before mirroring). */
  heroPosition?: string;
  /** Flip the article hero horizontally. */
  heroMirror?: boolean;
}

// ---------------------------------------------------------------- page blocks
export interface HomeHeroBlock {
  blockType: 'homeHero';
  heading: Inline;              // "Fly Business.\n*Pay Insider Rates.*"
  subheading: string;
  ratingText: string;           // "4.9/5.0 star rating" (desktop) ; mobile shows "5 star rating"
  mobileRatingText: string;
  steps: { label: string }[];   // 01 Share your route ...
  image: Media;
  mobileImage?: Media | null;
}
export interface BenefitsBlock { blockType: 'benefits'; items: { icon: Media; title: Inline; text: string }[] }
export interface HowItWorksBlock {
  blockType: 'howItWorks';
  heading: Inline;
  cards: { title: string; text: string; visual: 'image' | 'options' | 'checkout'; image?: Media | null }[];
  badge: { label: Inline; href: string };   // "Get *Flight*\nOptions"
}
export interface ReviewsBlock {
  blockType: 'reviews';
  heading: Inline;
  ratingLabel: string;          // "Excellent | Rated 4.9/5.0"
  /** Pinned testimonials (shown as is, in this order). Empty = the newest `limit` approved 5-star reviews (lib/cms.ts). */
  testimonials?: Testimonial[] | null;
  /** How many reviews to show when none are pinned. Default 8. */
  limit?: number | null;
  airlines: Media;
}
export interface FaqBlock { blockType: 'faq'; heading: Inline; items: { question: string; answer: string }[] }
export interface ContactCard { icon: 'phone' | 'email' | 'whatsapp'; title: string; body: Inline; linkLabel: string; linkUrl: string }
export interface ContactOptionsBlock { blockType: 'contactOptions'; heading?: Inline; cards: ContactCard[] }
export interface ContactHeroBlock { blockType: 'contactHero'; heading: Inline; subheading: string; body: string; image: Media; mobileImage?: Media | null }
/**
 * One row of the light-blue contact details card. `source` takes the value from Site Settings:
 *   'salesPhone' | 'supportPhone' -> that line's number (tel: link); 'email' -> the email of the selected inquiry type
 *   (Sales -> salesEmail, Support -> supportEmail; swaps when the contact form's toggle changes); 'custom' (default)
 *   -> `value` / `href` as typed. The label is always the editor's.
 */
export interface ContactDetailItem { label: string; source?: 'custom' | 'salesPhone' | 'supportPhone' | 'email' | null; value?: string | null; href?: string | null }
export interface ContactDetailsBlock { blockType: 'contactDetails'; items: ContactDetailItem[] }
/** Contact enquiry form. `details` renders the contact details card beside it (left column on desktop, above on mobile). */
export interface ContactFormBlock { blockType: 'contactForm'; submitLabel: string; note: string; details?: ContactDetailItem[] }
export interface ConfirmationBlock { blockType: 'confirmation'; heading: Inline; subheading: string; body: string; button: Link }
export interface UrgentAssistanceBlock { blockType: 'urgentAssistance'; heading: Inline; body: string; image: Media; mobileImage?: Media | null; cards: ContactCard[] }
export interface NextStepsBlock { blockType: 'nextSteps'; heading: Inline; steps: { title: string; text: string }[] }
export interface AboutHeroBlock { blockType: 'aboutHero'; heading: Inline; body: Inline }
/** "Our people, powered by AI": eyebrow, heading, intro and icon items (icon = a name in components/ui/icons.ts). */
export type TechnologyIcon = 'ai-search' | 'ai-route' | 'ai-watch' | 'ai-expert';
export interface TechnologyBlock {
  blockType: 'technology';
  eyebrow?: string | null;
  heading: Inline;
  intro?: string | null;
  items: { icon: TechnologyIcon; title: string; text: string }[];
}
export interface ExpertiseBlock { blockType: 'expertise'; heading: Inline; image: Media; items: { title: string; text: string }[] }
/** label = bold stat title ("90% Client Retention"); text = supporting line (desktop/tablet only, the mobile design shows the title alone). */
export interface StatsBlock { blockType: 'stats'; items: { icon: Media; label: Inline; text?: string }[] }
/** body is Inline (a newline forces the designed line break). primary opens the booking modal (href = no-JS fallback). */
export interface CtaBannerBlock { blockType: 'ctaBanner'; heading: Inline; body: Inline; primary: Link; secondary: Link }
export interface RichTextBlock { blockType: 'richText'; content: RichText }

export type PageBlock =
  | HomeHeroBlock | BenefitsBlock | HowItWorksBlock | ReviewsBlock | FaqBlock | ContactOptionsBlock
  | ContactHeroBlock | ContactDetailsBlock | ContactFormBlock | ConfirmationBlock | UrgentAssistanceBlock
  | NextStepsBlock | AboutHeroBlock | TechnologyBlock | ExpertiseBlock | StatsBlock | CtaBannerBlock | RichTextBlock;

export interface Page {
  id?: string | number;
  title: string;                 // admin title + breadcrumb label
  slug: string;                  // 'home' for '/'
  heading?: Inline;              // page H1 when the first block does not provide one (text pages, blog index)
  headerTheme: 'dark' | 'light'; // header over a dark hero or on cream
  showBreadcrumbs: boolean;
  layout: PageBlock[];
  seo?: Seo;
}
