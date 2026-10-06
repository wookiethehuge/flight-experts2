import type { Field, GroupField, TextField } from 'payload'

const HREF_RE = /^(https?:\/\/|mailto:|tel:|\/|#)/i

export const validateHref = (value: unknown): true | string => {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return 'Invalid link'
  return HREF_RE.test(value.trim())
    ? true
    : 'Use a site path starting with / (e.g. /contact/), an #anchor, https://, mailto: or tel:'
}

export const hrefField = (name = 'href', opts: { label?: string; required?: boolean; description?: string } = {}): TextField => ({
  name,
  type: 'text',
  label: opts.label ?? 'Link (URL or path)',
  required: opts.required ?? true,
  maxLength: 500,
  validate: (value: unknown, { required }: { required?: boolean }) => {
    if (required && !value) return 'This field is required.'
    return validateHref(value)
  },
  admin: {
    description: opts.description ?? 'Site path (/about/), #anchor, full URL, mailto: or tel:',
  },
})

/** `{ label, href }` row fields (for arrays of links). */
export const linkFields = (opts: { required?: boolean } = {}): Field[] => [
  {
    type: 'row',
    fields: [
      { name: 'label', type: 'text', required: opts.required ?? true, maxLength: 120, admin: { width: '50%' } },
      { ...hrefField('href', { required: opts.required ?? true }), admin: { width: '50%', description: hrefField().admin?.description } },
    ],
  },
]

/** A `{ label, href }` group (matches `Link` in apps/web/src/lib/types.ts). */
export const link = (name: string, opts: { label?: string; required?: boolean; description?: string } = {}): GroupField => ({
  name,
  type: 'group',
  label: opts.label,
  admin: { description: opts.description, hideGutter: true },
  fields: linkFields({ required: opts.required }),
})
