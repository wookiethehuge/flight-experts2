/** Small helpers for reading environment configuration. Read lazily so scripts can load .env first. */

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)

/** Public site URL (the static Astro site). Used for preview links and CORS. */
export const siteUrl = () => (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '')

/**
 * This server's public URL (optional). When set, media URLs are absolute. On Vercel it defaults to the project's
 * production domain (VERCEL_PROJECT_PRODUCTION_URL, e.g. flight-experts-cms.vercel.app).
 */
export const serverUrl = () =>
  (
    process.env.SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/$/, '')

/** Origins allowed to call the API from a browser (CORS + CSRF): SITE_URL, SERVER_URL and CORS_ORIGINS. */
export const allowedOrigins = () =>
  Array.from(new Set([siteUrl(), serverUrl(), ...list(process.env.CORS_ORIGINS)].filter(Boolean)))

export const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}
