import type { Field } from 'payload'
import { inlineText } from './inline'
import { hrefField } from './link'

/** Fields of a `ContactCard` (apps/web/src/lib/types.ts). */
export const contactCardFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'icon',
        type: 'select',
        required: true,
        defaultValue: 'phone',
        options: [
          { label: 'Phone', value: 'phone' },
          { label: 'Email', value: 'email' },
          { label: 'WhatsApp', value: 'whatsapp' },
        ],
        admin: { width: '30%' },
      },
      { name: 'title', type: 'text', required: true, maxLength: 120, admin: { width: '70%' } },
    ],
  },
  inlineText('body', { required: true, rows: 3 }),
  {
    type: 'row',
    fields: [
      { name: 'linkLabel', type: 'text', required: true, maxLength: 120, admin: { width: '50%' } },
      { ...hrefField('linkUrl', { label: 'Link URL' }), admin: { width: '50%', description: 'tel:, mailto:, https:// or a path' } },
    ],
  },
]
