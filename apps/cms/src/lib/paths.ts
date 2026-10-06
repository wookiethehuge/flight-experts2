import { siteUrl } from './env'

/** Public URL paths on the Astro site (keep in sync with apps/web/src/pages). */
export const pagePath = (slug?: string | null) => (!slug || slug === 'home' ? '/' : `/${slug}/`)
export const postPath = (slug?: string | null) => `/blog/${slug ?? ''}/`
export const authorPath = (slug?: string | null) => `/author/${slug ?? ''}/`

export const siteHref = (path: string) => `${siteUrl()}${path}`
