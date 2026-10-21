import type { CollectionConfig } from 'payload'
import { isAdmin, publishedOrAdmin } from '../access'
import { inlineText } from '../fields/inline'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { deployAfterChange, deployAfterDelete } from '../hooks/deployHook'
import { landingPath, siteHref } from '../lib/paths'

/**
 * Ad campaign landing pages: /lp/<slug>/ on the site (never indexed, not in the menu or sitemap). Each campaign gets
 * its own hero texts; the trust strip, How it works, reviews and FAQ come from the home page, so they stay in step.
 * To start a new campaign: duplicate an existing one, change the slug and texts, publish, and point the ad at the URL.
 */
export const LandingPages: CollectionConfig = {
  slug: 'landing-pages',
  labels: { singular: 'Landing page', plural: 'Landing pages' },
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', '_status', 'updatedAt'],
    description: 'Ad campaign pages at /lp/<slug>/. Hidden from Google; send ad traffic here. Leads show the page (with its ad tracking) under "Submitted from".',
    preview: (doc) => siteHref(landingPath(doc?.slug as string)),
    livePreview: { url: ({ data }) => siteHref(landingPath(data?.slug as string)) },
  },
  defaultSort: 'name',
  versions: { drafts: true, maxPerDoc: 30 },
  access: { read: publishedOrAdmin, create: isAdmin, update: isAdmin, delete: isAdmin, readVersions: isAdmin },
  hooks: { afterChange: [deployAfterChange], afterDelete: [deployAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 120, admin: { description: 'Campaign name (admin only), e.g. "Europe, Google Ads".' } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            { name: 'eyebrow', type: 'text', maxLength: 120, admin: { description: 'Line above the heading, e.g. "Flying Business Class to Europe?"' } },
            inlineText('heading', { required: true, description: 'Main heading. A new line forces a line break; *italic*.' }),
            { name: 'intro', type: 'textarea', maxLength: 600, admin: { rows: 3 } },
            {
              name: 'bullets',
              type: 'array',
              maxRows: 5,
              labels: { singular: 'Bullet', plural: 'Bullets' },
              admin: { description: 'Short ticked points under the intro.' },
              fields: [{ name: 'text', type: 'text', required: true, maxLength: 120 }],
            },
            { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Optional desktop photo. Empty: the home page hero photo.' } },
            { name: 'mobileImage', type: 'upload', relationTo: 'media', admin: { description: 'Optional portrait crop for phones.' } },
          ],
        },
        {
          label: 'Sections',
          fields: [
            inlineText('trustHeading', { description: 'Trust strip heading. Empty: "Trusted by **business class** travelers *worldwide*".' }),
            {
              name: 'benefits',
              type: 'array',
              maxRows: 4,
              labels: { singular: 'Benefit', plural: 'Benefits' },
              admin: { description: 'The burgundy band (4 items). Empty: the standard four.' },
              fields: [
                { name: 'title', type: 'text', required: true, maxLength: 60 },
                { name: 'text', type: 'text', maxLength: 80 },
              ],
            },
            {
              name: 'cta',
              type: 'group',
              label: 'Closing call to action',
              fields: [
                inlineText('heading', { description: 'Empty: "Ready to See Your Business-Class Options?"' }),
                { name: 'body', type: 'textarea', maxLength: 300, admin: { rows: 2 } },
                { name: 'buttonLabel', type: 'text', maxLength: 40, admin: { description: 'Empty: "Get My Flight Options".' } },
              ],
            },
          ],
        },
        { label: 'SEO', fields: [seoField] },
      ],
    },
    slugField({ from: 'name', description: 'The URL: /lp/<slug>/, e.g. "europe".' }),
  ],
}
