import type { GroupField } from 'payload'

/** Per-document SEO fields (matches `Seo` in apps/web/src/lib/types.ts). */
export const seoField: GroupField = {
  name: 'seo',
  type: 'group',
  label: 'SEO',
  admin: {
    description: 'Search and social sharing. Leave blank to use sensible defaults from the page content.',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Meta title',
      maxLength: 120,
      admin: { description: 'Shown in search results and browser tabs. Aim for 50 to 60 characters.' },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Meta description',
      maxLength: 320,
      admin: { rows: 3, description: 'Aim for 140 to 160 characters.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Social share image',
      admin: { description: 'Open Graph / Twitter image. 1200 x 630 recommended.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'canonical',
          type: 'text',
          label: 'Canonical URL',
          maxLength: 500,
          admin: { width: '70%', description: 'Only set when this content lives primarily at another URL.' },
          validate: (value: unknown) =>
            !value || (typeof value === 'string' && /^(https?:\/\/|\/)/i.test(value)) ? true : 'Use a full URL or a path starting with /',
        },
        {
          name: 'noindex',
          type: 'checkbox',
          label: 'Hide from search engines (noindex)',
          defaultValue: false,
          admin: { width: '30%', style: { alignSelf: 'center' } },
        },
      ],
    },
  ],
}
