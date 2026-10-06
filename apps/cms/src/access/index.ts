import type { Access, FieldAccess } from 'payload'

/** Any signed-in user is an administrator (users are staff only). */
export const isAdmin: Access = ({ req: { user } }) => Boolean(user)
export const isAdminField: FieldAccess = ({ req: { user } }) => Boolean(user)

export const anyone: Access = () => true

/** Public read of published documents only; signed-in users see drafts too. */
export const publishedOrAdmin: Access = ({ req: { user } }) => {
  if (user) return true
  return { _status: { equals: 'published' } }
}
