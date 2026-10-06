import type { CollectionConfig } from 'payload'
import { isAdmin, publishedOrAdmin } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { deployAfterChange, deployAfterDelete } from '../hooks/deployHook'
import { lexicalPlain } from '../lib/lexical'
import { postPath, siteHref } from '../lib/paths'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  admin: {
    group: 'Blog',
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedAt', '_status', 'updatedAt'],
    preview: (doc) => siteHref(postPath(doc?.slug as string)),
    livePreview: { url: ({ data }) => siteHref(postPath(data?.slug as string)) },
  },
  defaultSort: '-publishedAt',
  versions: { drafts: true, maxPerDoc: 50 },
  access: { read: publishedOrAdmin, create: isAdmin, update: isAdmin, delete: isAdmin, readVersions: isAdmin },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // estimate read time (200 wpm) when not set
        if (data && (data.readTime === undefined || data.readTime === null || data.readTime === '') && data.content) {
          const words = lexicalPlain(data.content).split(' ').filter(Boolean).length
          data.readTime = Math.max(1, Math.round(words / 200))
        }
        return data
      },
    ],
    afterChange: [deployAfterChange],
    afterDelete: [deployAfterDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'excerpt', type: 'textarea', required: true, maxLength: 500, admin: { rows: 3, description: 'Shown on blog cards and as the default meta description.' } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'content', type: 'richText', required: true },
          ],
        },
        {
          label: 'Images',
          fields: [
            { name: 'heroImage', type: 'upload', relationTo: 'media', required: true, admin: { description: 'Top of the article. At least 1600px wide.' } },
            { name: 'cardImage', type: 'upload', relationTo: 'media', admin: { description: 'Optional different crop for blog cards.' } },
          ],
        },
        {
          label: 'Art direction',
          description: 'Optional framing of the images with CSS only (the image file is never edited).',
          fields: [
            {
              name: 'art',
              type: 'group',
              label: false,
              hooks: {
                // API consumers get `cardCrop: null` when no crop is set (the admin form keeps the empty group)
                afterRead: [
                  ({ value, req }) => {
                    if (req.payloadAPI === 'local' || !value || typeof value !== 'object') return value
                    const crop = (value as { cardCrop?: { x?: number | null; y?: number | null; w?: number | null } | null }).cardCrop
                    const hasCrop = crop && [crop.x, crop.y, crop.w].some((n) => typeof n === 'number')
                    return { ...value, cardCrop: hasCrop ? crop : null }
                  },
                ],
              },
              fields: [
                {
                  name: 'cardCrop',
                  type: 'group',
                  label: 'Card crop',
                  admin: {
                    description: 'Region of the card image shown in the 3:2 blog card, as % of the image: top-left X / Y and width (100 = full width). Leave empty for no crop.',
                  },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'x', type: 'number', label: 'X %', min: 0, max: 100, admin: { width: '33%' } },
                        { name: 'y', type: 'number', label: 'Y %', min: 0, max: 100, admin: { width: '33%' } },
                        { name: 'w', type: 'number', label: 'Width %', min: 1, max: 100, admin: { width: '33%' } },
                      ],
                    },
                  ],
                },
                { name: 'cardShade', type: 'checkbox', label: 'Navy gradient over the card image', defaultValue: false },
                {
                  name: 'heroPosition',
                  type: 'text',
                  label: 'Hero image position',
                  maxLength: 40,
                  admin: { description: 'CSS object-position, e.g. "100% 71%". Applied before mirroring.' },
                },
                { name: 'heroMirror', type: 'checkbox', label: 'Flip the hero image horizontally', defaultValue: false },
              ],
            },
          ],
        },
        { label: 'SEO', fields: [seoField] },
      ],
    },
    // sidebar
    slugField(),
    { name: 'author', type: 'relationship', relationTo: 'authors', required: true, admin: { position: 'sidebar' } },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'readTime',
      type: 'number',
      required: true,
      min: 1,
      max: 120,
      admin: { position: 'sidebar', step: 1, description: 'Minutes. Calculated from the content if left empty.' },
    },
  ],
}
