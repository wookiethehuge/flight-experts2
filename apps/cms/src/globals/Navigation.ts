import type { GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'
import { linkFields } from '../fields/link'
import { deployAfterGlobalChange } from '../hooks/deployHook'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  admin: { group: 'Settings' },
  access: { read: anyone, update: isAdmin },
  hooks: { afterChange: [deployAfterGlobalChange] },
  fields: [
    {
      name: 'menu',
      type: 'array',
      label: 'Menu',
      labels: { singular: 'Menu item', plural: 'Menu items' },
      admin: { description: 'Hamburger menu items.' },
      fields: linkFields(),
    },
    {
      name: 'footer',
      type: 'array',
      label: 'Footer "Useful links"',
      labels: { singular: 'Link', plural: 'Links' },
      fields: linkFields(),
    },
  ],
}
