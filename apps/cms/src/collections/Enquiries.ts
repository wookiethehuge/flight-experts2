import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isAdminField } from '../access'
import { guardPublicEnquiry, notifyEnquiry, setDisplayName } from '../hooks/enquiry'
import { CABINS, LIMITS, TOPICS, TRIP_TYPES } from '../lib/enquiry'

const label = (v: string) => v.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/**
 * Leads from the quote form, booking modal and contact form (EnquiryPayload in apps/web/src/lib/forms.ts), plus
 * live chat leads (kind 'chat') created by the Jivo webhook (POST /api/jivo-webhook, src/hooks/jivo.ts).
 * Public: create only (POST /api/enquiries), guarded by guardPublicEnquiry. Staff: full access.
 */
export const Enquiries: CollectionConfig = {
  slug: 'enquiries',
  labels: { singular: 'Enquiry', plural: 'Enquiries' },
  admin: {
    group: 'Leads',
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'kind', 'topic', 'email', 'phone', 'status', 'createdAt'],
    listSearchableFields: ['displayName', 'email', 'phone', 'firstName', 'lastName', 'name'],
    description: 'Quote requests, contact messages and live chat leads from the website. Update the status as you work each lead.',
    enableRichTextRelationship: false,
  },
  defaultSort: '-createdAt',
  disableDuplicate: true,
  access: {
    create: anyone,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    readVersions: isAdmin,
  },
  hooks: {
    beforeOperation: [guardPublicEnquiry],
    beforeChange: [setDisplayName],
    afterChange: [notifyEnquiry],
  },
  fields: [
    { name: 'displayName', type: 'text', label: 'Name', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'quote',
          options: [
            { label: 'Quote request', value: 'quote' },
            { label: 'Contact message', value: 'contact' },
            { label: 'Live chat', value: 'chat' },
          ],
          admin: { width: '25%' },
        },
        {
          name: 'topic',
          type: 'select',
          label: 'Inquiry type',
          index: true,
          options: TOPICS.map((v) => ({ label: label(v), value: v })),
          admin: { width: '25%', condition: (d) => d?.kind === 'contact', description: 'Sales or support (contact form).' },
        },
        {
          name: 'tripType',
          type: 'select',
          options: TRIP_TYPES.map((v) => ({ label: label(v), value: v })),
          admin: { width: '25%', condition: (d) => d?.kind === 'quote' },
        },
        {
          name: 'cabin',
          type: 'select',
          options: CABINS.map((v) => ({ label: label(v), value: v })),
          admin: { width: '25%', condition: (d) => d?.kind === 'quote' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Trip',
      admin: { condition: (d) => d?.kind === 'quote' },
      fields: [
        {
          name: 'legs',
          type: 'array',
          label: 'Flights',
          maxRows: LIMITS.legs,
          labels: { singular: 'Flight', plural: 'Flights' },
          admin: { description: 'Flight 1 is the outbound flight.' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'from', type: 'text', maxLength: LIMITS.place, admin: { width: '40%' } },
                { name: 'to', type: 'text', maxLength: LIMITS.place, admin: { width: '40%' } },
                { name: 'date', type: 'text', maxLength: LIMITS.date, admin: { width: '20%' } },
              ],
            },
          ],
        },
        { name: 'returnDate', type: 'text', maxLength: LIMITS.date, admin: { description: 'Round trips only.' } },
        {
          name: 'travellers',
          type: 'group',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'adults', type: 'number', min: 0, max: LIMITS.travellers, admin: { width: '33%', step: 1 } },
                { name: 'children', type: 'number', min: 0, max: LIMITS.travellers, admin: { width: '33%', step: 1 } },
                { name: 'infants', type: 'number', min: 0, max: LIMITS.travellers, admin: { width: '33%', step: 1 } },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Contact',
      fields: [
        { name: 'name', type: 'text', label: 'Full name', maxLength: LIMITS.name, admin: { description: 'Quote form (single name field).' } },
        {
          type: 'row',
          fields: [
            { name: 'firstName', type: 'text', maxLength: LIMITS.name, admin: { width: '50%' } },
            { name: 'lastName', type: 'text', maxLength: LIMITS.name, admin: { width: '50%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'email',
              type: 'email',
              // required for website forms; a chat lead may only have left a phone number
              validate: (value: unknown, { siblingData, data }: { siblingData?: Record<string, unknown>; data?: Record<string, unknown> }) => {
                const kind = (data?.kind ?? siblingData?.kind) as string | undefined
                if (!value) return kind === 'chat' ? true : 'Please enter an email address.'
                return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value)) ? true : 'Please enter a valid email address.'
              },
              admin: { width: '50%' },
            },
            { name: 'phone', type: 'text', maxLength: LIMITS.phone, admin: { width: '50%' } },
          ],
        },
        { name: 'subject', type: 'text', maxLength: LIMITS.subject },
        { name: 'message', type: 'textarea', maxLength: LIMITS.message, admin: { rows: 6 } },
        { name: 'smsConsent', type: 'checkbox', label: 'Agreed to SMS updates', defaultValue: false },
        { name: 'pageUrl', type: 'text', label: 'Submitted from', maxLength: LIMITS.pageUrl },
      ],
    },
    // ---------------------------------------------------------- sidebar (staff)
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Quoted', value: 'quoted' },
        { label: 'Booked', value: 'booked' },
        { label: 'Closed', value: 'closed' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'notes', type: 'textarea', label: 'Internal notes', admin: { position: 'sidebar', rows: 8 } },
    {
      name: 'meta',
      type: 'group',
      label: 'Submission details',
      access: { read: isAdminField },
      admin: { position: 'sidebar', readOnly: true },
      fields: [
        { name: 'ip', type: 'text', label: 'IP address' },
        { name: 'userAgent', type: 'text', label: 'Browser' },
        { name: 'origin', type: 'text' },
        {
          name: 'crmStatus',
          type: 'select',
          label: 'CRM sync',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Sent', value: 'sent' },
            { label: 'Failed', value: 'failed' },
            { label: 'Not configured', value: 'skipped' },
          ],
        },
        { name: 'crmError', type: 'text', label: 'CRM error' },
        { name: 'externalId', type: 'text', label: 'External ID', index: true, admin: { description: 'e.g. jivo:<chat id> (prevents duplicates from webhook retries).' } },
      ],
    },
  ],
}
