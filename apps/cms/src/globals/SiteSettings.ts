import type { Field, GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'
import { inlineText } from '../fields/inline'
import { hrefField } from '../fields/link'
import { deployAfterGlobalChange } from '../hooks/deployHook'

const phoneGroup = (name: string, label: string, description: string): Field => ({
  name,
  type: 'group',
  label,
  admin: { description },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'display', type: 'text', required: true, maxLength: 40, admin: { width: '50%', description: 'e.g. "(888) 855-2389"' } },
        { ...hrefField('href', { label: 'Link' }), admin: { width: '50%', description: 'e.g. "tel:+18888552389"' } },
      ],
    },
  ],
})

const hhmm = (v: unknown) => (!v || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? true : 'Use 24h HH:MM, e.g. 08:30')

/**
 * Site-wide settings (SiteSettings in apps/web/src/lib/types.ts).
 * `disclaimers` is a string[] in the API: it is edited as `disclaimerItems` rows and exposed through a virtual field.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Settings', description: 'Contact details, trust badges and footer content used across the site.' },
  access: { read: anyone, update: isAdmin },
  hooks: {
    // accept the API shape (`disclaimers: string[]`) on write too (runs before field hooks drop the virtual value)
    beforeOperation: [
      ({ args, operation }) => {
        const data = (args as { data?: Record<string, unknown> }).data
        if (operation === 'update' && data && Array.isArray(data.disclaimers) && !data.disclaimerItems) {
          data.disclaimerItems = (data.disclaimers as unknown[])
            .filter((d): d is string => typeof d === 'string' && d.trim() !== '')
            .map((text) => ({ text }))
        }
        return args
      },
    ],
    afterChange: [deployAfterGlobalChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Contact',
          fields: [
            {
              name: 'phone',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'display', type: 'text', required: true, maxLength: 40, admin: { width: '50%', description: 'e.g. "(888) 855-2389"' } },
                    { ...hrefField('href', { label: 'Link' }), admin: { width: '50%', description: 'e.g. "tel:+18888552389"' } },
                  ],
                },
              ],
            },
            { name: 'phoneFull', type: 'text', required: true, maxLength: 40, admin: { description: 'International format for the footer, e.g. "+1 (888) 855-2389".' } },
            phoneGroup('salesPhone', 'Sales line', 'Contact page details card ("Sales Line" row) and the Sales inquiry option.'),
            phoneGroup('supportPhone', 'Customer support line', 'Contact page details card ("Customer Support" row) and the Support inquiry option.'),
            {
              type: 'row',
              fields: [
                { name: 'salesEmail', type: 'email', required: true, admin: { width: '50%', description: 'Shown on the Contact page when "Sales inquiry" is selected.' } },
                { name: 'supportEmail', type: 'email', required: true, admin: { width: '50%', description: 'Shown on the Contact page when "Support inquiry" is selected.' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'email', type: 'email', required: true, admin: { width: '50%', description: 'Customer service email.' } },
                { name: 'enquiriesEmail', type: 'email', required: true, admin: { width: '50%', description: 'New enquiries email.' } },
              ],
            },
            { name: 'address', type: 'text', required: true, maxLength: 200 },
            { name: 'whatsappUrl', type: 'text', label: 'WhatsApp URL', required: true, maxLength: 300, admin: { description: 'e.g. https://wa.me/18888552389' } },
            {
              name: 'socials',
              type: 'group',
              admin: { description: 'Leave empty to hide an icon.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'facebook', type: 'text', maxLength: 300, admin: { width: '33%' } },
                    { name: 'linkedin', type: 'text', maxLength: 300, admin: { width: '33%' } },
                    { name: 'instagram', type: 'text', maxLength: 300, admin: { width: '33%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Header & menu',
          fields: [
            { name: 'headerPhoneLabel', type: 'text', required: true, maxLength: 60, admin: { description: 'Small label above the header phone number, e.g. "24/7 PHONE DEALS".' } },
            {
              name: 'callPill',
              type: 'group',
              label: 'Call pill',
              admin: { description: 'Floating "call us" pill.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'title', type: 'text', required: true, maxLength: 80, admin: { width: '50%' } },
                    { name: 'subtitle', type: 'text', required: true, maxLength: 80, admin: { width: '50%' } },
                  ],
                },
              ],
            },
            {
              name: 'menuContacts',
              type: 'array',
              label: 'Menu contacts',
              labels: { singular: 'Contact', plural: 'Contacts' },
              admin: { description: 'Contact lines at the bottom of the hamburger menu.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'label', type: 'text', required: true, maxLength: 60, admin: { width: '33%' } },
                    { name: 'value', type: 'text', required: true, maxLength: 120, admin: { width: '33%' } },
                    { ...hrefField('href'), admin: { width: '33%', description: 'tel:, mailto: or URL' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Trust',
          fields: [
            {
              name: 'trustpilot',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'rating', type: 'text', required: true, maxLength: 20, admin: { width: '30%', description: 'e.g. "4.9/5.0"' } },
                    { name: 'url', type: 'text', label: 'Profile URL', maxLength: 300, admin: { width: '70%' } },
                  ],
                },
              ],
            },
            {
              name: 'accreditations',
              type: 'array',
              labels: { singular: 'Accreditation', plural: 'Accreditations' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'name', type: 'text', required: true, maxLength: 80, admin: { width: '50%' } },
                    { name: 'url', type: 'text', maxLength: 300, admin: { width: '50%' } },
                  ],
                },
                { name: 'logo', type: 'upload', relationTo: 'media', required: true },
              ],
            },
            { name: 'paymentMethods', type: 'upload', relationTo: 'media', required: true, label: 'Payment methods image' },
          ],
        },
        {
          label: 'Footer',
          fields: [
            { name: 'footerVision', type: 'textarea', required: true, maxLength: 600, admin: { rows: 3 } },
            { name: 'copyright', type: 'text', required: true, maxLength: 200 },
            {
              name: 'disclaimerItems',
              type: 'array',
              label: 'Disclaimers',
              labels: { singular: 'Disclaimer', plural: 'Disclaimers' },
              admin: { description: 'Small-print paragraphs at the bottom of every page.' },
              fields: [{ name: 'text', type: 'textarea', required: true, maxLength: 3000, admin: { rows: 4 } }],
            },
            {
              name: 'disclaimers',
              type: 'text',
              hasMany: true,
              virtual: true,
              admin: { hidden: true },
              hooks: {
                afterRead: [
                  ({ siblingData }) =>
                    ((siblingData?.disclaimerItems ?? []) as { text?: string }[]).map((d) => d?.text ?? '').filter(Boolean),
                ],
              },
            },
          ],
        },
        {
          label: 'Forms',
          fields: [
            inlineText('consentNote', {
              required: true,
              label: 'Consent note',
              maxLength: 600,
              description: 'One line under the quote form and contact form buttons (contact consent + privacy). Have counsel review changes.',
            }),
          ],
        },
        {
          label: 'Live chat',
          fields: [
            {
              name: 'chat',
              type: 'group',
              label: false,
              admin: {
                description:
                  'The round chat button (mobile). "None": it opens a small panel with WhatsApp, call and the quote form. "Jivo": it loads and opens the Jivo chat (setup steps in apps/cms/README.md).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'provider',
                      type: 'select',
                      required: true,
                      defaultValue: 'none',
                      options: [
                        { label: 'None (built-in panel)', value: 'none' },
                        { label: 'Jivo', value: 'jivo' },
                      ],
                      admin: { width: '40%' },
                    },
                    {
                      name: 'jivoWidgetId',
                      type: 'text',
                      label: 'Jivo widget ID',
                      maxLength: 40,
                      validate: (v: unknown, { siblingData }: { siblingData?: { provider?: string } }) => {
                        if (siblingData?.provider !== 'jivo') return true
                        if (!v) return 'Required when the provider is Jivo.'
                        return /^[A-Za-z0-9_-]{4,40}$/.test(String(v)) ? true : 'Letters, digits, - and _ only (the id at the end of the Jivo script URL).'
                      },
                      admin: {
                        width: '60%',
                        description: 'From the install code: //code.jivosite.com/widget/<ID>',
                        condition: (_: unknown, sibling: { provider?: string }) => sibling?.provider === 'jivo',
                      },
                    },
                  ],
                },
                {
                  name: 'businessHours',
                  type: 'group',
                  label: 'Business hours (informational)',
                  admin: {
                    description:
                      'Used to label the chat button "Chat now" or "Leave a message" before Jivo has loaded. Agent schedules themselves are set per agent in Jivo.',
                  },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'timezone', type: 'text', maxLength: 60, admin: { width: '34%', description: 'IANA name, e.g. America/Chicago' } },
                        { name: 'open', type: 'text', maxLength: 5, validate: hhmm, admin: { width: '33%', description: '24h, e.g. 08:00' } },
                        { name: 'close', type: 'text', maxLength: 5, validate: hhmm, admin: { width: '33%', description: '24h, e.g. 20:00 (23:59 = midnight)' } },
                      ],
                    },
                    {
                      name: 'days',
                      type: 'select',
                      hasMany: true,
                      options: [
                        { label: 'Mon', value: 'mon' },
                        { label: 'Tue', value: 'tue' },
                        { label: 'Wed', value: 'wed' },
                        { label: 'Thu', value: 'thu' },
                        { label: 'Fri', value: 'fri' },
                        { label: 'Sat', value: 'sat' },
                        { label: 'Sun', value: 'sun' },
                      ],
                    },
                  ],
                },
                { name: 'note', type: 'textarea', maxLength: 300, admin: { rows: 2, description: 'Optional line in the built-in chat panel.' } },
              ],
            },
          ],
        },
        {
          label: 'Blog',
          fields: [
            {
              name: 'blogCta',
              type: 'group',
              label: 'Blog call to action',
              admin: { description: 'Banner at the end of blog articles.' },
              fields: [
                inlineText('heading', { required: true }),
                { name: 'body', type: 'textarea', required: true, maxLength: 600, admin: { rows: 2 } },
                {
                  type: 'row',
                  fields: [
                    { name: 'primaryLabel', type: 'text', required: true, maxLength: 60, admin: { width: '50%' } },
                    { name: 'secondaryLabel', type: 'text', required: true, maxLength: 60, admin: { width: '50%' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
