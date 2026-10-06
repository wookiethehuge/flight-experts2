import type { TextField } from 'payload'

export const slugify = (input: string, allowSlash = false) =>
  input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(allowSlash ? /[^a-z0-9/]+/g : /[^a-z0-9]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/(^[-/]+|[-/]+$)/g, '')

/** Unique URL slug, generated from `from` (default `title`) when left empty. */
export const slugField = (opts: { from?: string; allowSlash?: boolean; description?: string } = {}): TextField => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  maxLength: 160,
  admin: {
    position: 'sidebar',
    description: opts.description ?? 'URL segment. Generated from the title if left empty. Lowercase letters, numbers and hyphens.',
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        const source = typeof value === 'string' && value.trim() ? value : (data?.[opts.from ?? 'title'] as string | undefined)
        return typeof source === 'string' ? slugify(source, opts.allowSlash) : value
      },
    ],
  },
})
