import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'
import { anyone, isAdmin } from '../access'
import { deployAfterChange } from '../hooks/deployHook'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Images for the site. The original is always kept (the Astro build optimises it into AVIF/WebP srcsets);
 * resized copies are generated for admin thumbnails and any direct consumers. SVGs are stored as-is.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Media', plural: 'Media' },
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
    description: 'Images. Always write meaningful alt text; describe what the image shows for someone who cannot see it.',
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    // alt text / file replacements change the live site
    afterChange: [(args) => (args.operation === 'update' ? deployAfterChange(args) : args.doc)],
  },
  upload: {
    staticDir: process.env.MEDIA_DIR || path.resolve(dirname, '../../media'),
    mimeTypes: ['image/*'],
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    crop: true,
    imageSizes: [
      { name: 'thumbnail', width: 400 },
      { name: 'small', width: 800 },
      { name: 'medium', width: 1280 },
      { name: 'large', width: 1920 },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      maxLength: 300,
      admin: { description: 'Alternative text for screen readers and search engines.' },
    },
  ],
}
