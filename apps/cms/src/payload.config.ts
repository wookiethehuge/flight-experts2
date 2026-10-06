import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Authors } from './collections/Authors'
import { Enquiries } from './collections/Enquiries'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Testimonials } from './collections/Testimonials'
import { Users } from './collections/Users'
import { Navigation } from './globals/Navigation'
import { SiteSettings } from './globals/SiteSettings'
import { jivoWebhook } from './hooks/jivo'
import { trustpilotSync } from './hooks/trustpilotSync'
import { allowedOrigins, serverUrl, siteUrl } from './lib/env'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// On Vercel the Neon integration provides DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED. The build (CI=1: migrations
// + first-deploy seed) uses the direct connection; the running site uses the pooled one.
const DATABASE_URI =
  process.env.DATABASE_URI ||
  (process.env.CI ? process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING : undefined) ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'file:./flight-experts.db'
const SERVER_URL = serverUrl() || `http://localhost:${process.env.PORT || 3000}`

/**
 * Postgres when DATABASE_URI is a postgres:// URL, otherwise SQLite (local dev). The SQLite adapter is imported lazily:
 * its native libsql module isn't traced into the Vercel function bundle, so a static import crashes every request there.
 */
async function database() {
  if (process.env.VERCEL && !/^postgres(ql)?:\/\//i.test(DATABASE_URI)) {
    throw new Error(
      'No Postgres database: connect a Neon database to this Vercel project (Storage tab), then redeploy. See DEPLOY.md.',
    )
  }
  if (/^postgres(ql)?:\/\//i.test(DATABASE_URI)) {
    return postgresAdapter({
      pool: { connectionString: DATABASE_URI },
      // schema changes in production go through migrations (pnpm --filter cms migrate:create / migrate)
      push: process.env.NODE_ENV !== 'production' && process.env.DB_PUSH !== 'false' && !process.env.VERCEL,
      migrationDir: path.resolve(dirname, 'migrations'),
    })
  }
  const { sqliteAdapter } = await import('@payloadcms/db-sqlite')
  return sqliteAdapter({
    client: { url: DATABASE_URI, authToken: process.env.DATABASE_AUTH_TOKEN },
    push: process.env.DB_PUSH !== 'false',
    migrationDir: path.resolve(dirname, 'migrations'),
  })
}

/** Optional SMTP (password resets + new-lead notifications). */
const email = process.env.SMTP_HOST
  ? nodemailerAdapter({
      defaultFromAddress: process.env.SMTP_FROM_ADDRESS || 'no-reply@flight-experts.com',
      defaultFromName: process.env.SMTP_FROM_NAME || 'Flight Experts',
      transportOptions: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      },
    })
  : undefined

export default buildConfig({
  serverURL: SERVER_URL,
  secret: process.env.PAYLOAD_SECRET || '',
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' | Flight Experts CMS' },
    livePreview: {
      collections: ['pages', 'posts'],
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 390, height: 844 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
    components: {},
  },
  collections: [Pages, Testimonials, Media, Posts, Authors, Enquiries, Users],
  globals: [SiteSettings, Navigation],
  // POST /api/jivo-webhook: live chat leads -> enquiries (kind 'chat')
  // POST /api/trustpilot-sync: daily Trustpilot review batch -> testimonials (upsert by reviewId)
  endpoints: [jivoWebhook, trustpilotSync],
  editor: lexicalEditor({
    // Only the features the site's renderer supports (apps/web/src/lib/richtext.ts). No H1: pages have one already.
    features: () => [
      ParagraphFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
      BoldFeature(),
      ItalicFeature(),
      UnderlineFeature(),
      StrikethroughFeature(),
      InlineCodeFeature(),
      UnorderedListFeature(),
      OrderedListFeature(),
      LinkFeature({ enabledCollections: ['pages'] }),
      BlockquoteFeature(),
      HorizontalRuleFeature(),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ],
  }),
  db: await database(),
  email,
  sharp,
  // Serverless hosts (Vercel) have no persistent disk: with BLOB_READ_WRITE_TOKEN set (Vercel Blob store connected to
  // the project), uploads go to Vercel Blob and media URLs point straight at the blob CDN. Otherwise: local MEDIA_DIR.
  plugins: [
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: { media: { prefix: 'media', disablePayloadAccessControl: true } },
      token: process.env.BLOB_READ_WRITE_TOKEN,
      clientUploads: true, // large files go browser -> blob directly (Vercel functions cap request bodies at 4.5MB)
    }),
  ],
  // Browsers on the static site (SITE_URL, CORS_ORIGINS) may call the API (enquiry form POSTs).
  cors: allowedOrigins(),
  // Cookie auth (admin) is only accepted from the admin origin (+ CSRF_ORIGINS).
  csrf: [SERVER_URL, ...(process.env.CSRF_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)],
  // types are generated explicitly (pnpm generate:types); auto-generation in dev is slow on small machines
  typescript: { autoGenerate: false, outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disablePlaygroundInProduction: true },
  upload: { limits: { fileSize: 20_000_000 } },
  telemetry: false,
  onInit: async (payload) => {
    if (!process.env.PAYLOAD_SECRET) payload.logger.error('PAYLOAD_SECRET is not set. Copy .env.example to .env.')
    payload.logger.info(`Site: ${siteUrl()} | CORS: ${allowedOrigins().join(', ')}`)
  },
})
