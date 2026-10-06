import type { TextareaField } from 'payload'

export const INLINE_HELP =
  'Inline formatting: *italic*, **bold**, [link label](https://example.com or /path). Press Enter for a line break.'

type InlineOptions = {
  label?: string
  required?: boolean
  description?: string
  maxLength?: number
  rows?: number
}

/**
 * Editor-typed short string using the site's inline syntax (see apps/web/src/lib/inline.ts):
 * *italic*, **bold**, [label](url) and newlines as line breaks.
 */
export const inlineText = (name: string, opts: InlineOptions = {}): TextareaField => ({
  name,
  type: 'textarea',
  label: opts.label,
  required: opts.required ?? false,
  maxLength: opts.maxLength ?? 400,
  admin: {
    rows: opts.rows ?? 2,
    description: opts.description ? `${opts.description} ${INLINE_HELP}` : INLINE_HELP,
  },
})
