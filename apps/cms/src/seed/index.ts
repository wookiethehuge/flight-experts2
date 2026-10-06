/**
 * Seed the CMS from the web app's seed content (apps/web/src/content/seed) and images (apps/web/src/assets/seed).
 *
 *   pnpm --filter cms seed
 *
 * Idempotent: documents are upserted (pages/posts/authors by slug, manual testimonials by name, media by filename,
 * globals replaced). Synced Trustpilot testimonials are never matched or changed by the seed. Seed testimonials are
 * `source: manual`, `approved: true`; a reviews block without `testimonials` shows the newest approved 5-star ones. Seed shapes are the same as the REST API (apps/web/src/lib/types.ts) with three shorthands:
 *   - images:      { "file": "hero.webp", "alt": "..." }  -> uploaded to Media (deduplicated by filename)
 *   - rich text:   plain text (blank line = paragraph, "## " heading, "- " bullets) -> Lexical JSON
 *   - relations:   post.author = author slug; reviews block testimonials (optional pins) = testimonial names
 * A document that fails validation (e.g. a stub page still being written) is saved as a DRAFT and reported.
 *
 * SEED_IF_EMPTY=1 skips seeding when any page exists (the Vercel build runs it on every deploy).
 * Env: SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD create the first admin user; SEED_DIR / SEED_ASSETS_DIR override paths.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload, ValidationError, type CollectionSlug, type Payload, type Where } from 'payload'
import config from '../payload.config'
import { lexicalFromText } from '../lib/lexical'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(dirname, '../../../web/src')
const SEED_DIR = path.resolve(process.env.SEED_DIR || path.join(WEB, 'content/seed'))
const ASSETS_DIR = path.resolve(process.env.SEED_ASSETS_DIR || path.join(WEB, 'assets/seed'))
// A fresh object per call: hooks write flags into req.context (the storage plugin sets skipCloudStorage and clears it on
// a copy), so a shared object would leak them into later calls and silently skip every upload after the first.
const context = () => ({ disableDeployHook: true, skipEnquiryNotify: true })

type Json = any
type Id = number | string

const stats = { created: 0, updated: 0, drafts: [] as string[], failed: [] as string[], warnings: [] as string[] }
const warn = (m: string) => {
  stats.warnings.push(m)
  console.warn(`  ! ${m}`)
}

const readJson = (file: string): Json => JSON.parse(fs.readFileSync(file, 'utf8'))
const readDir = (dir: string): { file: string; data: Json }[] => {
  const full = path.join(SEED_DIR, dir)
  if (!fs.existsSync(full)) return []
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      const data = readJson(path.join(full, f))
      return (Array.isArray(data) ? data : [data]).map((d) => ({ file: `${dir}/${f}`, data: d }))
    })
}

const errorText = (err: unknown) => {
  if (err instanceof ValidationError) return err.data.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
  return (err as Error)?.message ?? String(err)
}

async function main() {
  if (!fs.existsSync(SEED_DIR)) throw new Error(`Seed directory not found: ${SEED_DIR}`)
  const payload = await getPayload({ config })
  // SEED_IF_EMPTY=1 (used by the Vercel build): only seed a fresh database, so redeploys never overwrite editors' work
  if (process.env.SEED_IF_EMPTY === '1' || process.env.SEED_IF_EMPTY === 'true') {
    const { totalDocs } = await payload.count({ collection: 'pages' })
    if (totalDocs > 0) {
      console.log(`Database already has ${totalDocs} pages: seed skipped.`)
      await payload.destroy?.()
      process.exit(0)
    }
  }
  console.log(`Seeding from ${SEED_DIR}`)

  await seedAdmin(payload)

  // ------------------------------------------------------------------ media (on demand)
  const mediaIds = new Map<string, Id>()
  async function media(file: string, alt: string): Promise<Id | null> {
    if (mediaIds.has(file)) return mediaIds.get(file)!
    const filePath = path.join(ASSETS_DIR, file)
    if (!fs.existsSync(filePath)) {
      warn(`image not found: ${filePath}`)
      return null
    }
    const found = await payload.find({ collection: 'media', where: { filename: { equals: file } }, limit: 1, depth: 0 })
    let id: Id
    if (found.docs[0]) {
      id = found.docs[0].id
      if (alt && found.docs[0].alt !== alt) await payload.update({ collection: 'media', id, data: { alt }, context: context() })
    } else {
      const doc = await payload.create({
        collection: 'media',
        data: { alt: alt || file },
        filePath,
        overwriteExistingFiles: true,
        context: context(),
      })
      id = doc.id
      console.log(`  + media ${file}`)
    }
    mediaIds.set(file, id)
    return id
  }

  /** Replace image shorthands with media ids (deep). */
  async function resolveMedia(v: Json): Promise<Json> {
    if (Array.isArray(v)) return Promise.all(v.map(resolveMedia))
    if (v && typeof v === 'object') {
      if (typeof v.file === 'string' && 'alt' in v && Object.keys(v).length <= 3) return media(v.file, v.alt ?? '')
      const out: Json = {}
      for (const [k, val] of Object.entries(v)) out[k] = await resolveMedia(val)
      return out
    }
    return v
  }

  const rich = (v: Json) => (typeof v === 'string' ? lexicalFromText(v) : v)

  // ------------------------------------------------------------------ upsert helper
  async function upsert(collection: CollectionSlug, where: Where, data: Json, label: string, drafts: boolean) {
    const found = await payload.find({ collection, where, limit: 1, depth: 0, draft: drafts })
    const existing = found.docs[0]
    const run = (asDraft: boolean) => {
      const body = drafts ? { ...data, _status: asDraft ? 'draft' : 'published' } : data
      return existing
        ? payload.update({ collection, id: existing.id, data: body, draft: asDraft, context: context(), depth: 0 })
        : payload.create({ collection, data: body, draft: asDraft, context: context(), depth: 0 })
    }
    try {
      const doc = await run(false)
      existing ? stats.updated++ : stats.created++
      console.log(`  ${existing ? '~' : '+'} ${collection} ${label}`)
      return doc
    } catch (err) {
      if (drafts && err instanceof ValidationError) {
        try {
          const doc = await run(true)
          stats.drafts.push(`${collection}/${label}: ${errorText(err)}`)
          warn(`${collection} ${label} saved as DRAFT (not published): ${errorText(err)}`)
          return doc
        } catch (err2) {
          err = err2
        }
      }
      stats.failed.push(`${collection}/${label}: ${errorText(err)}`)
      console.error(`  x ${collection} ${label}: ${errorText(err)}`)
      return null
    }
  }

  // ------------------------------------------------------------------ testimonials (manual ones only, by name)
  const manualByName = (name: string): Where => ({
    and: [{ name: { equals: name } }, { or: [{ source: { equals: 'manual' } }, { source: { exists: false } }] }],
  })
  const testimonialIds = new Map<string, Id>()
  const testimonialsFile = path.join(SEED_DIR, 'testimonials.json')
  if (fs.existsSync(testimonialsFile)) {
    const list: Json[] = readJson(testimonialsFile)
    for (const [i, t] of list.entries()) {
      const doc = await upsert('testimonials', manualByName(t.name), { order: i, source: 'manual', approved: true, ...t }, t.name, false)
      if (doc) testimonialIds.set(t.name, doc.id)
    }
  }
  async function testimonialId(t: Json): Promise<Id | null> {
    if (typeof t === 'number') return t
    const name = typeof t === 'string' ? t : t?.name
    if (!name) return null
    if (testimonialIds.has(name)) return testimonialIds.get(name)!
    if (typeof t === 'object') {
      const doc = await upsert('testimonials', manualByName(name), { source: 'manual', approved: true, ...t }, name, false)
      if (doc) testimonialIds.set(name, doc.id)
      return doc?.id ?? null
    }
    const found = await payload.find({ collection: 'testimonials', where: manualByName(name), limit: 1, depth: 0 })
    if (found.docs[0]) return found.docs[0].id
    warn(`testimonial not found: "${name}"`)
    return null
  }

  // ------------------------------------------------------------------ authors
  const authorIds = new Map<string, Id>()
  for (const { file, data } of readDir('authors')) {
    if (!data?.slug) {
      warn(`${file}: author without slug skipped`)
      continue
    }
    const doc = await upsert('authors', { slug: { equals: data.slug } }, await resolveMedia(data), data.slug, false)
    if (doc) authorIds.set(data.slug, doc.id)
  }
  async function authorId(a: Json): Promise<Id | null> {
    const slug = typeof a === 'string' ? a : a?.slug
    if (!slug) return null
    if (authorIds.has(slug)) return authorIds.get(slug)!
    const found = await payload.find({ collection: 'authors', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    if (found.docs[0]) return found.docs[0].id
    warn(`author not found: "${slug}"`)
    return null
  }

  // ------------------------------------------------------------------ posts
  for (const { file, data } of readDir('posts')) {
    if (!data?.slug) {
      warn(`${file}: post without slug skipped`)
      continue
    }
    const post = await resolveMedia(data)
    post.content = rich(post.content)
    post.author = await authorId(data.author)
    await upsert('posts', { slug: { equals: data.slug } }, post, data.slug, true)
  }

  // ------------------------------------------------------------------ pages
  for (const { file, data } of readDir('pages')) {
    if (!data?.slug) {
      warn(`${file}: page without slug skipped`)
      continue
    }
    const page = await resolveMedia(data)
    page.layout = await Promise.all(
      (page.layout ?? []).map(async (b: Json) => {
        if (b.blockType === 'reviews' && Array.isArray(b.testimonials))
          b.testimonials = (await Promise.all(b.testimonials.map(testimonialId))).filter((x) => x !== null)
        if (b.blockType === 'richText') b.content = rich(b.content)
        return b
      }),
    )
    await upsert('pages', { slug: { equals: data.slug } }, page, data.slug, true)
  }

  // ------------------------------------------------------------------ globals
  const globals: [string, 'site-settings' | 'navigation'][] = [
    ['settings.json', 'site-settings'],
    ['navigation.json', 'navigation'],
  ]
  for (const [fileName, slug] of globals) {
    const file = path.join(SEED_DIR, fileName)
    if (!fs.existsSync(file)) {
      warn(`${fileName} not found`)
      continue
    }
    try {
      await payload.updateGlobal({ slug, data: await resolveMedia(readJson(file)), context: context(), depth: 0 })
      stats.updated++
      console.log(`  ~ global ${slug}`)
    } catch (err) {
      stats.failed.push(`global ${slug}: ${errorText(err)}`)
      console.error(`  x global ${slug}: ${errorText(err)}`)
    }
  }

  // unknown files
  const known = new Set(['settings.json', 'navigation.json', 'testimonials.json', 'authors', 'posts', 'pages'])
  for (const f of fs.readdirSync(SEED_DIR)) if (!known.has(f)) warn(`seed entry not imported (unknown): ${f}`)

  console.log(
    `\nDone: ${stats.created} created, ${stats.updated} updated, ${mediaIds.size} images, ` +
      `${stats.drafts.length} saved as draft, ${stats.failed.length} failed, ${stats.warnings.length} warnings.`,
  )
  if (stats.drafts.length) console.log(`Drafts (fix the seed data, then re-run):\n  - ${stats.drafts.join('\n  - ')}`)
  if (stats.failed.length) console.log(`Failed:\n  - ${stats.failed.join('\n  - ')}`)
  await payload.destroy?.()
  process.exit(stats.failed.length ? 1 : 0)
}

async function seedAdmin(payload: Payload) {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) {
    warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: no admin user created (create one at /admin).')
    return
  }
  const found = await payload.find({ collection: 'users', where: { email: { equals: email.toLowerCase() } }, limit: 1 })
  if (found.docs[0]) {
    console.log(`  = admin user ${email} exists`)
    return
  }
  await payload.create({ collection: 'users', data: { email, password, name: 'Admin' }, context: context() })
  console.log(`  + admin user ${email}`)
}

// top-level await: `payload run` exits as soon as this module finishes evaluating
try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
