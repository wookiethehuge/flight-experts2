import type { CollectionConfig } from 'payload'
import { isAdmin, publishedOrAdmin } from '../access'
import { pageBlocks } from '../blocks'
import { inlineText } from '../fields/inline'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { deployAfterChange, deployAfterDelete } from '../hooks/deployHook'
import { pagePath, siteHref } from '../lib/paths'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    description: 'Site pages built from layout blocks. The page with slug "home" is the home page.',
    preview: (doc) => siteHref(pagePath(doc?.slug as string)),
    livePreview: { url: ({ data }) => siteHref(pagePath(data?.slug as string)) },
  },
  defaultSort: 'title',
  versions: { drafts: true, maxPerDoc: 50 },
  access: { read: publishedOrAdmin, create: isAdmin, update: isAdmin, delete: isAdmin, readVersions: isAdmin },
  hooks: { afterChange: [deployAfterChange], afterDelete: [deployAfterDelete] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120, admin: { description: 'Admin title and breadcrumb label.' } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            inlineText('heading', {
              description: 'Page H1 for pages whose first block has no heading (text pages, blog index).',
            }),
            {
              name: 'layout',
              type: 'blocks',
              blocks: pageBlocks,
              labels: { singular: 'Block', plural: 'Blocks' },
              admin: { initCollapsed: false },
            },
          ],
        },
        { label: 'SEO', fields: [seoField] },
      ],
    },
    slugField({ allowSlash: true, description: 'URL path without slashes at the ends, e.g. "about" or "terms-and-conditions". Use "home" for the home page.' }),
    {
      name: 'headerTheme',
      type: 'select',
      required: true,
      defaultValue: 'light',
      options: [
        { label: 'Dark (over a dark hero)', value: 'dark' },
        { label: 'Light (on cream)', value: 'light' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'showBreadcrumbs', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
}
