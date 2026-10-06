import type { CollectionConfig } from 'payload'
import { anyone, isAdmin } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { deployAfterChange, deployAfterDelete } from '../hooks/deployHook'
import { authorPath, siteHref } from '../lib/paths'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Blog',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'slug', 'updatedAt'],
    preview: (doc) => siteHref(authorPath(doc?.slug as string)),
  },
  defaultSort: 'name',
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { afterChange: [deployAfterChange], afterDelete: [deployAfterDelete] },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 120, admin: { width: '50%' } },
        { name: 'role', type: 'text', required: true, maxLength: 120, admin: { width: '50%', description: 'e.g. "Senior Travel Consultant"' } },
      ],
    },
    slugField({ from: 'name' }),
    { name: 'photo', type: 'upload', relationTo: 'media', required: true },
    { name: 'bioIntro', type: 'textarea', label: 'Bio (intro)', required: true, maxLength: 1500, admin: { rows: 4 } },
    { name: 'quote', type: 'textarea', maxLength: 600, admin: { rows: 2, description: 'Optional pull quote on the author page.' } },
    { name: 'bioMore', type: 'textarea', label: 'Bio (more)', maxLength: 3000, admin: { rows: 5, description: 'Optional second part of the bio.' } },
    {
      name: 'expertise',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 12,
      labels: { singular: 'Area', plural: 'Areas of expertise' },
      fields: [{ name: 'label', type: 'text', required: true, maxLength: 80 }],
    },
    {
      type: 'row',
      fields: [
        { name: 'linkedin', type: 'text', label: 'LinkedIn URL', maxLength: 300, admin: { width: '50%' } },
        { name: 'x', type: 'text', label: 'X (Twitter) URL', maxLength: 300, admin: { width: '50%' } },
      ],
    },
    seoField,
  ],
}
