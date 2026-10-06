# Flight Experts website

Marketing and lead-generation site for Flight Experts: an **Astro** static front end (`apps/web`) with content and
leads managed in **Payload CMS** (`apps/cms`). pnpm workspace.

```
apps/web   Astro 5 site (static HTML, zero JS by default, small script islands for the menu, quote form, modal)
apps/cms   Payload 3 (Next.js) admin + REST API: pages, blog, authors, testimonials, media, settings, enquiries
```

## Quick start

```bash
pnpm install

# 1. Front end only (builds from the seed content in apps/web/src/content/seed, no CMS needed)
pnpm --filter web dev            # http://localhost:4321
pnpm --filter web build          # -> apps/web/dist (static files, deploy anywhere)

# 2. With the CMS
cp apps/cms/.env.example apps/cms/.env        # set PAYLOAD_SECRET
pnpm --filter cms seed                        # SQLite DB + admin user + all seed content and images
pnpm --filter cms dev                         # http://localhost:3000/admin
cd apps/web && PAYLOAD_URL=http://localhost:3000 PUBLIC_FORMS_ENDPOINT=http://localhost:3000 pnpm build
```

Seed admin login (change it): `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `apps/cms/.env`.

## How it fits together

- **Content**: the site reads Payload's REST API at build time (`PAYLOAD_URL`). Without it, the same shapes come from
  `apps/web/src/content/seed` (which the CMS seed script also imports). Contract: `apps/web/src/lib/types.ts`.
  Pages are built from blocks that mirror the design sections (hero, benefits, how it works, reviews, FAQ, contact
  options, contact form, confirmation, next steps, expertise, stats, CTA, rich text). Every page has SEO fields.
- **Reviews**: a scraper POSTs the latest Trustpilot reviews once a day to `POST /api/trustpilot-sync`; they land in
  **Testimonials** as not approved. Editors approve them; Reviews blocks show the newest approved 5-star reviews
  (or the testimonials pinned on the block). See `apps/cms/README.md` > Trustpilot sync.
- **Publishing**: publishing in Payload calls `DEPLOY_HOOK_URL` (e.g. a Netlify/Vercel/Cloudflare Pages build hook) so
  the static site rebuilds.
- **Leads**: the quote form (hero + booking modal, trip -> contact step) and the contact form POST JSON to
  `PUBLIC_FORMS_ENDPOINT/api/enquiries` (the CMS). Validation on both sides, honeypot + minimum-time check, per-IP
  rate limit, optional Cloudflare Turnstile. The contact form sends an inquiry type (`topic`: sales / support). Live chat
  (Jivo, optional) leads arrive through `POST /api/jivo-webhook`; see `apps/cms/README.md` > Live chat. New leads appear under **Leads > Enquiries** and are forwarded to
  `CRM_WEBHOOK_URL` (signed JSON) and/or emailed if SMTP is configured. Contract: `apps/web/src/lib/forms.ts`.
- **Design tokens**: `apps/web/src/styles/tokens.css` (colours, fonts, fluid type/spacing between the 390px and
  1440px designs). Fonts are self-hosted woff2 (General Sans, IBM Plex Serif) with metric-matched fallbacks.

## Environment

| Where | Variable | Purpose |
| --- | --- | --- |
| web | `SITE_URL` | canonical/OG/sitemap base, default `https://www.flight-experts.com` |
| web | `PAYLOAD_URL` | CMS URL for content at build time (empty = seed content) |
| web | `PUBLIC_FORMS_ENDPOINT` | where forms POST (defaults to `PAYLOAD_URL`; empty = forms simulate success) |
| web | `PUBLIC_TURNSTILE_SITE_KEY` | optional Turnstile "verify you are human" on the contact form and quote contact step (pair with the CMS `TURNSTILE_SECRET_KEY`). Test keys: site `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA` |
| cms | see `apps/cms/README.md` | `PAYLOAD_SECRET`, `DATABASE_URI`, `SITE_URL`, `CORS_ORIGINS`, `DEPLOY_HOOK_URL`, `CRM_WEBHOOK_URL`, `TURNSTILE_SECRET_KEY`, `JIVO_WEBHOOK_SECRET`, `TRUSTPILOT_SYNC_SECRET`, SMTP ... |

## Deploying

**Vercel (both apps): step by step in [DEPLOY.md](DEPLOY.md).** Two projects from this repo: `apps/cms` (Payload on
Vercel functions + Neon Postgres + Vercel Blob for images; each deploy runs migrations, and the first one seeds the
content) and `apps/web` (Astro static). `*.vercel.app` builds are noindex.

Elsewhere:
- **Site**: any static host. Build command `pnpm --filter web build`, output `apps/web/dist`, env `SITE_URL`,
  `PAYLOAD_URL`, `PUBLIC_FORMS_ENDPOINT`.
- **CMS**: a long-running Node host (Railway, Render, Fly, a VPS) with Postgres (`DATABASE_URI=postgres://...`) and
  persistent or S3 media storage. Run `pnpm --filter cms migrate` on deploy. Set `SITE_URL` / `CORS_ORIGINS` to the
  site origin. Details in `apps/cms/README.md`.

## Working in VS Code

Open the repo folder; accept the recommended extensions. `corepack enable && pnpm install`, then
**Terminal > Run Task**: *Dev: site (seed content)*, *Dev: CMS*, *Dev: site + CMS*, *CMS: seed*,
*CMS: create migration*, *Build: ...*, *Check: types*. Node 22 (`.nvmrc`).

## Quality bar (checked before handover)

Matches the Figma frames at 390 and 1440 (within ~2px), fluid with no overflow from 320 to 1920, axe-core clean,
Lighthouse mobile 97-99 performance and 100 accessibility / best practices / SEO, CLS 0, sitemap, robots, JSON-LD
(Organization, WebSite, FAQPage, BlogPosting, Person, BreadcrumbList).
