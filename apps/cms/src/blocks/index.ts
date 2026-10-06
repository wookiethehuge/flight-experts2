/**
 * Page layout blocks. One block per `PageBlock` interface in apps/web/src/lib/types.ts.
 * Block slug = `blockType`; field names match the interfaces exactly (REST depth=2 returns those shapes).
 */
import type { Block, Field, TextareaField, TextField, UploadField } from 'payload'
import { contactCardFields } from '../fields/contactCard'
import { inlineText } from '../fields/inline'
import { hrefField, link } from '../fields/link'

const image = (name: string, opts: { required?: boolean; description?: string; label?: string } = {}): UploadField => ({
  name,
  type: 'upload',
  relationTo: 'media',
  label: opts.label,
  required: opts.required ?? false,
  admin: { description: opts.description },
})

const text = (name: string, opts: { required?: boolean; description?: string; maxLength?: number; label?: string } = {}): TextField => ({
  name,
  type: 'text',
  label: opts.label,
  required: opts.required ?? true,
  maxLength: opts.maxLength ?? 200,
  admin: { description: opts.description },
})

const para = (name: string, opts: { required?: boolean; description?: string; maxLength?: number; label?: string } = {}): TextareaField => ({
  name,
  type: 'textarea',
  label: opts.label,
  required: opts.required ?? true,
  maxLength: opts.maxLength ?? 1500,
  admin: { rows: 3, description: opts.description },
})

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function block(
  slug: string,
  singular: string,
  group: string,
  description: string,
  fields: Field[],
): Block {
  return {
    slug,
    interfaceName: `${pascal(slug)}Block`,
    labels: { singular, plural: `${singular} blocks` },
    admin: { group, custom: { description } },
    fields: [
      {
        name: 'blockInfo',
        type: 'ui',
        admin: {
          components: {
            Field: { path: '/components/BlockDescription#BlockDescription', clientProps: { text: description } },
          },
        },
      },
      ...fields,
    ],
  }
}

// ------------------------------------------------------------------ home
export const HomeHero = block('homeHero', 'Home hero', 'Home', 'Full-bleed hero at the top of the home page with the quote form, rating and three steps.', [
  inlineText('heading', { required: true, description: 'Large H1. Example: "Fly Business." then a new line with "*Pay Insider Rates.*".' }),
  para('subheading', { maxLength: 400 }),
  {
    type: 'row',
    fields: [
      { ...text('ratingText', { description: 'Desktop, e.g. "4.9/5.0 star rating"' }), admin: { width: '50%', description: 'Desktop, e.g. "4.9/5.0 star rating"' } },
      { ...text('mobileRatingText', { description: 'Mobile, e.g. "5 star rating"' }), admin: { width: '50%', description: 'Mobile, e.g. "5 star rating"' } },
    ],
  },
  {
    name: 'steps',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 6,
    labels: { singular: 'Step', plural: 'Steps' },
    admin: { description: 'Numbered steps under the heading (01, 02, 03 are added automatically).' },
    fields: [text('label', { maxLength: 80 })],
  },
  image('image', { required: true, label: 'Background image (desktop)', description: 'Loaded eagerly (LCP). At least 1920px wide.' }),
  image('mobileImage', { label: 'Background image (mobile)', description: 'Optional crop for phones. Falls back to the desktop image.' }),
])

export const Benefits = block('benefits', 'Benefits', 'Home', 'Row of icon + title + short text benefits.', [
  {
    name: 'items',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 8,
    labels: { singular: 'Benefit', plural: 'Benefits' },
    fields: [image('icon', { required: true, description: 'SVG icon.' }), inlineText('title', { required: true }), para('text', { maxLength: 400 })],
  },
])

export const HowItWorks = block('howItWorks', 'How it works', 'Home', 'Three illustrated step cards with a circular call-to-action badge.', [
  inlineText('heading', { required: true }),
  {
    name: 'cards',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 6,
    labels: { singular: 'Card', plural: 'Cards' },
    fields: [
      text('title', { maxLength: 120 }),
      para('text', { maxLength: 600 }),
      {
        name: 'visual',
        type: 'select',
        required: true,
        defaultValue: 'image',
        options: [
          { label: 'Photo', value: 'image' },
          { label: 'Flight options illustration', value: 'options' },
          { label: 'Checkout illustration', value: 'checkout' },
        ],
        admin: { description: 'What the card shows above its text.' },
      },
      { ...image('image', { description: 'Used when Visual is "Photo".' }), admin: { condition: (_: unknown, sibling: { visual?: string }) => sibling?.visual === 'image', description: 'Used when Visual is "Photo".' } },
    ],
  },
  {
    name: 'badge',
    type: 'group',
    admin: { description: 'Round rotating badge linking to the quote form.' },
    fields: [inlineText('label', { required: true, description: 'e.g. "Get *Flight*\\nOptions"' }), hrefField('href')],
  },
])

export const Reviews = block('reviews', 'Reviews', 'Home', 'Trustpilot rating, testimonial carousel and airline logos. Shows the newest approved 5-star testimonials automatically, or the ones pinned below.', [
  inlineText('heading', { required: true }),
  text('ratingLabel', { description: 'e.g. "Excellent | Rated 4.9/5.0"' }),
  {
    name: 'testimonials',
    type: 'relationship',
    relationTo: 'testimonials',
    hasMany: true,
    label: 'Pinned testimonials',
    admin: {
      description:
        'Optional. Leave empty to show the newest approved 5-star reviews automatically (synced Trustpilot reviews first, by date). ' +
        'Pick testimonials here to show exactly these, in this order, instead.',
    },
  },
  {
    name: 'limit',
    type: 'number',
    defaultValue: 8,
    min: 1,
    max: 24,
    admin: { step: 1, description: 'How many reviews to show when none are pinned (default 8).' },
  },
  image('airlines', { required: true, label: 'Airline logos image' }),
])

export const Faq = block('faq', 'FAQ', 'General', 'Accordion of questions and answers (also emitted as FAQPage structured data).', [
  inlineText('heading', { required: true }),
  {
    name: 'items',
    type: 'array',
    required: true,
    minRows: 1,
    labels: { singular: 'Question', plural: 'Questions' },
    admin: { initCollapsed: true },
    fields: [text('question', { maxLength: 300 }), para('answer', { maxLength: 3000 })],
  },
])

// ------------------------------------------------------------------ contact
const contactCards = (description: string): Field => ({
  name: 'cards',
  type: 'array',
  required: true,
  minRows: 1,
  maxRows: 6,
  labels: { singular: 'Contact card', plural: 'Contact cards' },
  admin: { description },
  fields: contactCardFields,
})

export const ContactOptions = block('contactOptions', 'Contact options', 'Contact', 'Phone / email / WhatsApp cards.', [
  inlineText('heading', { description: 'Optional section heading.' }),
  contactCards('One card per contact channel.'),
])

export const ContactHero = block('contactHero', 'Contact hero', 'Contact', 'Contact page hero: heading, intro and photo.', [
  inlineText('heading', { required: true }),
  text('subheading', { maxLength: 300 }),
  para('body'),
  image('image', { required: true, label: 'Image (desktop)' }),
  image('mobileImage', { label: 'Image (mobile)', description: 'Optional crop for phones.' }),
])

/** Rows of the light-blue contact details card (ContactDetailItem). */
const contactDetailItems = (name: string, opts: { required: boolean; description?: string }): Field => ({
  name,
  type: 'array',
  required: opts.required,
  minRows: opts.required ? 1 : undefined,
  labels: { singular: 'Detail', plural: 'Details' },
  admin: { description: opts.description },
  fields: [
    {
      type: 'row',
      fields: [
        { ...text('label', { maxLength: 80 }), admin: { width: '25%' } },
        {
          name: 'source',
          type: 'select',
          required: true,
          defaultValue: 'custom',
          options: [
            { label: 'Custom value', value: 'custom' },
            { label: 'Sales phone (Site settings)', value: 'salesPhone' },
            { label: 'Support phone (Site settings)', value: 'supportPhone' },
            { label: 'Email of the selected inquiry type (Site settings)', value: 'email' },
          ],
          admin: {
            width: '25%',
            description: 'Phone and email rows read Site settings > Contact. The email row follows the Sales / Support choice on the contact form.',
          },
        },
        {
          ...text('value', { required: false, maxLength: 300 }),
          admin: { width: '25%', condition: (_: unknown, sibling: { source?: string }) => !sibling?.source || sibling.source === 'custom' },
        },
        {
          ...hrefField('href', { required: false, label: 'Link (optional)' }),
          admin: {
            width: '25%',
            description: 'tel:, mailto: or URL',
            condition: (_: unknown, sibling: { source?: string }) => !sibling?.source || sibling.source === 'custom',
          },
        },
      ],
    },
  ],
})

export const ContactDetails = block('contactDetails', 'Contact details', 'Contact', 'List of label / value contact details (phone, email, address).', [
  contactDetailItems('items', { required: true }),
])

export const ContactForm = block('contactForm', 'Contact form', 'Contact', 'The contact enquiry form (submissions arrive in Leads > Enquiries).', [
  text('submitLabel', { maxLength: 60, description: 'Button text.' }),
  para('note', { maxLength: 600, description: 'Small print under the form.' }),
  contactDetailItems('details', {
    required: false,
    description:
      'Optional contact details card shown beside the form (left column on desktop, above the form on mobile). The form has a Sales / Support inquiry choice that swaps the email row and highlights the matching phone row.',
  }),
])

export const Confirmation = block('confirmation', 'Confirmation', 'Contact', 'Thank-you message shown after a form is sent.', [
  inlineText('heading', { required: true }),
  text('subheading', { maxLength: 300 }),
  para('body'),
  link('button', { required: true, description: 'Button under the message.' }),
])

export const UrgentAssistance = block('urgentAssistance', 'Urgent assistance', 'Contact', 'Photo panel with contact cards for travellers who need help now.', [
  inlineText('heading', { required: true }),
  para('body'),
  image('image', { required: true, label: 'Image (desktop)' }),
  image('mobileImage', { label: 'Image (mobile)', description: 'Optional crop for phones.' }),
  contactCards('Contact channels shown on the panel.'),
])

export const NextSteps = block('nextSteps', 'Next steps', 'Contact', 'Numbered list of what happens next.', [
  inlineText('heading', { required: true }),
  {
    name: 'steps',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 8,
    labels: { singular: 'Step', plural: 'Steps' },
    fields: [text('title', { maxLength: 120 }), para('text', { maxLength: 600 })],
  },
])

// ------------------------------------------------------------------ about
export const AboutHero = block('aboutHero', 'About hero', 'About', 'About page heading with an intro paragraph.', [
  inlineText('heading', { required: true }),
  inlineText('body', { required: true, rows: 4, maxLength: 1500 }),
])

const TECH_ICONS = [
  { label: 'Search (magnifier)', value: 'ai-search' },
  { label: 'Route (connected stops)', value: 'ai-route' },
  { label: 'Watch (bell)', value: 'ai-watch' },
  { label: 'Expert (person + spark)', value: 'ai-expert' },
]

export const Technology = block('technology', 'Technology (AI)', 'About', 'Eyebrow, heading and intro with up to 8 icon items on how technology supports the experts.', [
  text('eyebrow', { required: false, maxLength: 80, description: 'Small line above the heading, e.g. "Expertise, amplified".' }),
  inlineText('heading', { required: true, description: 'e.g. "Our people, *powered by AI*".' }),
  para('intro', { required: false, maxLength: 600 }),
  {
    name: 'items',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 8,
    labels: { singular: 'Item', plural: 'Items' },
    fields: [
      { name: 'icon', type: 'select', required: true, defaultValue: 'ai-search', options: TECH_ICONS },
      text('title', { maxLength: 80 }),
      para('text', { maxLength: 400 }),
    ],
  },
])

export const Expertise = block('expertise', 'Expertise', 'About', 'Photo alongside a list of expertise points.', [
  inlineText('heading', { required: true }),
  image('image', { required: true }),
  {
    name: 'items',
    type: 'array',
    required: true,
    minRows: 1,
    labels: { singular: 'Item', plural: 'Items' },
    fields: [text('title', { maxLength: 120 }), para('text', { maxLength: 800 })],
  },
])

export const Stats = block('stats', 'Stats', 'About', 'Row of icon + short stat labels.', [
  {
    name: 'items',
    type: 'array',
    required: true,
    minRows: 1,
    maxRows: 8,
    labels: { singular: 'Stat', plural: 'Stats' },
    fields: [
      image('icon', { required: true, description: 'SVG icon.' }),
      inlineText('label', { required: true, description: 'Bold stat title, e.g. "90% Client Retention".' }),
      para('text', { required: false, maxLength: 300, description: 'Supporting line (desktop and tablet only).' }),
    ],
  },
])

// ------------------------------------------------------------------ general
export const CtaBanner = block('ctaBanner', 'Call to action banner', 'General', 'Heading, text and two buttons. The primary button opens the booking form (its link is the no-JavaScript fallback).', [
  inlineText('heading', { required: true }),
  inlineText('body', { required: true, rows: 3, maxLength: 600, description: 'A new line forces a line break.' }),
  link('primary', { required: true, label: 'Primary button' }),
  link('secondary', { required: true, label: 'Secondary button' }),
])

export const RichTextBlockConfig = block('richText', 'Rich text', 'General', 'Long-form text (terms, privacy policy). Use Heading 2 for sections.', [
  { name: 'content', type: 'richText', required: true },
])

export const pageBlocks: Block[] = [
  HomeHero,
  Benefits,
  HowItWorks,
  Reviews,
  Faq,
  ContactOptions,
  ContactHero,
  ContactDetails,
  ContactForm,
  Confirmation,
  UrgentAssistance,
  NextSteps,
  AboutHero,
  Technology,
  Expertise,
  Stats,
  CtaBanner,
  RichTextBlockConfig,
]
