import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access'

/** Staff accounts. Every user is an administrator. */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { group: 'Settings', useAsTitle: 'email', defaultColumns: ['name', 'email', 'updatedAt'] },
  auth: { tokenExpiration: 60 * 60 * 8, maxLoginAttempts: 10, lockTime: 10 * 60 * 1000 },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin, admin: ({ req: { user } }) => Boolean(user) },
  fields: [{ name: 'name', type: 'text', maxLength: 120 }],
}
