import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isAdminField } from '../access'
import { deployAfterChange, deployAfterDelete } from '../hooks/deployHook'

/**
 * Customer reviews: typed in by editors (`source: manual`) or synced daily from Trustpilot by
 * POST /api/trustpilot-sync (`source: trustpilot`, see src/hooks/trustpilotSync.ts).
 * Synced reviews arrive with `approved: false`; only approved 5-star reviews are pulled onto the site automatically.
 * The sync only ever rewrites the review content (name, title, body, rating, date, url, country, language, reply,
 * raw); `approved`, `order` and `source` stay as editors set them.
 */
export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'rating', 'source', 'approved', 'reviewDate'],
    listSearchableFields: ['name', 'title', 'body', 'reviewId'],
    description:
      'Customer reviews. Trustpilot reviews sync in daily as "not approved": tick Approved (in the list or the review) to allow one on the site. ' +
      'Reviews blocks show the newest approved 5-star reviews unless the block pins specific ones.',
  },
  defaultSort: '-reviewDate',
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeChange: [
      ({ data }) => {
        // an emptied text input must not collide with the unique index
        if (data && typeof data.reviewId === 'string' && !data.reviewId.trim()) data.reviewId = null
        return data
      },
    ],
    afterChange: [deployAfterChange],
    afterDelete: [deployAfterDelete],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 120, admin: { width: '50%', description: 'Reviewer name as shown.' } },
        { name: 'rating', type: 'number', required: true, min: 1, max: 5, defaultValue: 5, index: true, admin: { width: '25%', step: 1 } },
        { name: 'order', type: 'number', defaultValue: 0, index: true, admin: { width: '25%', description: 'Lower numbers first (reviews without a date).' } },
      ],
    },
    { name: 'title', type: 'text', required: true, maxLength: 200, admin: { description: 'Review headline.' } },
    {
      name: 'body',
      type: 'textarea',
      maxLength: 5000,
      admin: { rows: 6, description: 'Required for manual reviews. The site shows up to about 400 characters per card.' },
      validate: (value: string | null | undefined, { siblingData }: { siblingData: Record<string, unknown> }) =>
        siblingData?.source === 'trustpilot' || (typeof value === 'string' && value.trim()) ? true : 'This field is required.',
    },

    // ---------------------------------------------------------------- sidebar
    {
      name: 'approved',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Shown on the site. Synced Trustpilot reviews start unticked.',
        components: { Cell: '/components/ApprovedCell#ApprovedCell' },
      },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      required: true,
      index: true,
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Trustpilot', value: 'trustpilot' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'reviewDate',
      type: 'date',
      index: true,
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' }, description: 'Newest first on the site.' },
    },
    {
      name: 'reviewId',
      type: 'text',
      unique: true,
      index: true,
      maxLength: 200,
      admin: { position: 'sidebar', description: 'Trustpilot review id (set by the sync). Leave empty for manual reviews.' },
    },
    {
      name: 'lastSyncedAt',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' }, description: 'Last time the Trustpilot sync sent this review.' },
    },

    // ---------------------------------------------------------------- Trustpilot details
    {
      type: 'collapsible',
      label: 'Trustpilot details',
      admin: { initCollapsed: true, description: 'Filled by the Trustpilot sync and overwritten on each sync.' },
      fields: [
        { name: 'reviewUrl', type: 'text', maxLength: 2000, admin: { description: 'Link to the review on Trustpilot.' } },
        {
          type: 'row',
          fields: [
            { name: 'country', type: 'text', maxLength: 60, admin: { width: '50%' } },
            { name: 'language', type: 'text', maxLength: 20, admin: { width: '50%' } },
          ],
        },
        { name: 'replyText', type: 'textarea', maxLength: 5000, label: 'Company reply', admin: { rows: 3 } },
        {
          name: 'raw',
          type: 'json',
          label: 'Raw scraper data (debugging)',
          access: { read: isAdminField, create: isAdminField, update: isAdminField },
          admin: { readOnly: true, description: 'The review exactly as the scraper sent it. Not public.' },
        },
      ],
    },
  ],
}
