# Deploying to Vercel (test URL)

The repo deploys as **two Vercel projects**, both from the same GitHub repo:

| Project | Root Directory | What it is | Test URL (example) |
| --- | --- | --- | --- |
| `flight-experts-cms` | `apps/cms` | Payload admin + API, Postgres (Neon), images in Vercel Blob | `https://flight-experts-cms.vercel.app/admin` |
| `flight-experts-web` | `apps/web` | Astro static site, built from the CMS content | `https://flight-experts-web.vercel.app` |

Publishing in the CMS calls the site's deploy hook, so the static site rebuilds in about 2 minutes.
While the site runs on a `*.vercel.app` address it is **noindex** (meta robots + `Disallow: /`), so the test URL
never gets into Google. On the real domain it switches to indexable automatically.

Free (Hobby) plans of Vercel, Neon and Vercel Blob are enough for testing.

---

## 0. Open in VS Code

1. Unzip, then **File > Open Folder** on `flight-experts`. Accept the recommended extensions.
2. Terminal: `corepack enable` (once, gives you pnpm), then `pnpm install`.
3. Optional local run: **Terminal > Run Task > Dev: site (seed content)**, opens on http://localhost:4321.

## 1. Push to GitHub

**Source Control** panel > **Publish Branch** > choose **private** repository. (The repo already has a first commit.)

## 2. CMS project

1. vercel.com > **Add New > Project** > import the repo.
2. Project name `flight-experts-cms`, **Root Directory: `apps/cms`** (click Edit). Framework detects Next.js; leave the
   build settings alone (`vercel.json` sets them).
3. **Environment Variables** (before the first deploy):

   | Name | Value |
   | --- | --- |
   | `PAYLOAD_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `SEED_ADMIN_EMAIL` | your admin login email |
   | `SEED_ADMIN_PASSWORD` | a strong password (change it in the admin afterwards) |
   | `SITE_URL` | `https://flight-experts-web.vercel.app` (the site project's URL, step 3) |
   | `TRUSTPILOT_SYNC_SECRET` | `openssl rand -hex 32`. Share it with the scraper developer via a one-time link |

4. Click **Deploy**. The first deploy **fails on purpose** with "No Postgres database". That's expected.
5. In the project: **Storage > Create Database > Neon** (free) > Connect to project (all environments).
6. **Storage > Create > Blob** > Connect to project.
7. **Deployments > ... > Redeploy**. This build runs the database migrations, then seeds all pages, posts, reviews
   and images (first deploy only; later deploys never overwrite edits), then builds the admin.
8. Open `https://<cms-url>/admin` and log in with the seed admin.

## 3. Site project

1. **Add New > Project** > the same repo again.
2. Project name `flight-experts-web`, **Root Directory: `apps/web`**. Framework detects Astro.
3. Environment Variables:

   | Name | Value |
   | --- | --- |
   | `PAYLOAD_URL` | `https://flight-experts-cms.vercel.app` (CMS URL, no trailing slash) |
   | `PUBLIC_FORMS_ENDPOINT` | same as `PAYLOAD_URL` |
   | `PUBLIC_TURNSTILE_SITE_KEY` | optional, test key `1x00000000000000000000AA` |

4. **Deploy.**

## 4. Connect the two

1. Site project > **Settings > Git > Deploy Hooks** > name `cms-publish`, branch `main` > copy the URL.
2. CMS project > **Settings > Environment Variables**:
   - `DEPLOY_HOOK_URL` = that URL
   - If the site URL isn't exactly what you put in `SITE_URL`, fix it now (forms are only accepted from that origin).
   - Optional: `TURNSTILE_SECRET_KEY` (test `1x0000000000000000000000000000000AA`), `CRM_WEBHOOK_URL`,
     `JIVO_WEBHOOK_SECRET`, SMTP settings (see `apps/cms/.env.example`).
3. Redeploy the CMS so it picks up the new variables.

## 5. Test checklist

- Edit a heading in the CMS > Publish > the site updates within about 2 minutes (site project > Deployments).
- Submit the contact form and a quote form > they appear under **Leads > Enquiries** (and in the CRM if set).
- Trustpilot: send the scraper developer `https://<cms-url>/api/trustpilot-sync` + the secret. Reviews land in
  **Testimonials** as not approved; approve one and it shows on the home page after the rebuild.
- Check the site on phone and desktop; `/robots.txt` should say `Disallow: /` on the test URL.

## Notes

- **Schema changes** (new fields/collections): run **Run Task > CMS: create migration** against a Postgres database
  and commit the new files in `apps/cms/src/migrations`; Vercel runs pending migrations on each CMS deploy. Local dev
  on SQLite doesn't need migrations (schema is pushed automatically).
- **Pushing to `main`** redeploys both projects. To skip site rebuilds for CMS-only commits, set the site project's
  **Settings > Git > Ignored Build Step** to `git diff --quiet HEAD^ HEAD -- . ../../pnpm-lock.yaml`.
- **Going live** later: add the real domain to the site project, set `SITE_URL` on the CMS to it, and redeploy the site.
  Indexing turns on automatically once the site is off `*.vercel.app` (or set `SITE_NOINDEX=0`).
- Lead form rate limiting is per server instance on Vercel; Turnstile is the main bot protection there, so turn it
  on with real keys before launch.
