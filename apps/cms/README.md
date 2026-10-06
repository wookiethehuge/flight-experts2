# Flight Experts CMS (`apps/cms`)

Payload 3 (Next.js App Router) holding all editable site content and the leads (enquiries) inbox.
The Astro site in `apps/web` reads it over REST at build time; the site's forms POST enquiries to it.

- Admin: `http://localhost:3000/admin`
- REST: `http://localhost:3000/api/...` (GraphQL at `/api/graphql`)
- Content contract: `apps/web/src/lib/types.ts` (REST responses at `depth=2` match those interfaces)
- Enquiry contract: `apps/web/src/lib/forms.ts`

## Setup

```bash
pnpm install                              # from the repo root
cp apps/cms/.env.example apps/cms/.env    # then set PAYLOAD_SECRET (openssl rand -hex 32)
pnpm --filter cms seed                    # creates the SQLite DB, admin user, media and content
pnpm --filter cms dev                     # http://localhost:3000/admin
```

Build the site against it:

```bash
cd apps/web && PAYLOAD_URL=http://localhost:3000 pnpm build
```

Other scripts: `pnpm --filter cms build` / `start` (production), `generate:types` (writes `src/payload-types.ts`),
`generate:importmap` (after adding admin components), `migrate:create` / `migrate` (Postgres migrations),
`typecheck`.

## Database

| `DATABASE_URI` | Adapter |
| --- | --- |
| `file:./flight-experts.db` (default) | `@payloadcms/db-sqlite` (libSQL). Local dev. |
| `postgres://user:pass@host:5432/db` (or `postgresql://`) | `@payloadcms/db-postgres` |

The switch is automatic (see `database()` in `src/payload.config.ts`). In development the schema is pushed
automatically. For production Postgres, generate and commit migrations and run them on deploy:

```bash
DATABASE_URI=postgres://... pnpm --filter cms migrate:create initial
DATABASE_URI=postgres://... pnpm --filter cms migrate          # on each deploy, before `start`
```

Note: after a *destructive* schema change (removing/renaming fields) the dev push may wait for a confirmation
prompt. If the dev server seems to hang after editing a collection, stop it and run `pnpm --filter cms seed`
(or `pnpm --filter cms payload migrate:status`) in a terminal to answer the prompt, then restart.

## Content model

| Slug | Type | Admin group | Notes |
| --- | --- | --- | --- |
| `pages` | collection, drafts | Content | `title`, `slug` (unique, `home` = `/`), `heading`, `headerTheme`, `showBreadcrumbs`, `layout` (blocks), `seo` |
| `testimonials` | collection | Content | `name`, `title`, `body`, `rating`, `order`, `approved`, `source` (manual / trustpilot), `reviewDate`, `reviewId` (unique), `reviewUrl`, `country`, `language`, `replyText`, `lastSyncedAt`, `raw` (staff only). See "Trustpilot sync" |
| `media` | upload | Content | required `alt`; original kept + `thumbnail` 400 / `small` 800 / `medium` 1280 / `large` 1920 |
| `posts` | collection, drafts | Blog | `author` -> authors, Lexical `content`, `publishedAt`, `readTime` (auto from word count if empty), `heroImage`, `cardImage`, `art`, `seo` |
| `authors` | collection | Blog | |
| `enquiries` | collection | Leads | public create only, see below |
| `users` | auth | Settings | staff; every user is an admin |
| `site-settings` | global | Settings | `SiteSettings` |
| `navigation` | global | Settings | `menu`, `footer` |

Page blocks (block slug = `blockType`): `homeHero`, `benefits`, `howItWorks`, `reviews`, `faq`, `contactOptions`,
`contactHero`, `contactDetails`, `contactForm`, `confirmation`, `urgentAssistance`, `nextSteps`, `aboutHero`,
`technology`, `expertise`, `stats`, `ctaBanner`, `richText` (`src/blocks/index.ts`). Each block shows a short description in the
admin.

Reusable fields (`src/fields`): `seoField` (title, description, image, canonical, noindex), `link` / `linkFields`
(`{ label, href }` with href validation), `inlineText` (textarea whose admin help explains `*italic*`, `**bold**`,
`[label](url)` and new lines), `slugField`, `contactCardFields`.

Details worth knowing:

- Contact lines: `site-settings.salesPhone` / `supportPhone` (`{ display, href }`), `salesEmail`, `supportEmail`.
  The contact details card rows (`contactForm.details`, `contactDetails.items`) pick a `source`
  (`salesPhone`, `supportPhone`, `email` = email of the selected inquiry type, or `custom` with `value`/`href`);
  labels stay editable on the block.
- `site-settings.consentNote` (inline text) is the one-line consent / privacy note under the quote and contact form
  buttons.
- `site-settings.chat`: live chat (see "Live chat (Jivo)" below).
- `reviews` block: `testimonials` (optional pins) and `limit` (default 8). With no pins the site shows the newest
  `limit` testimonials that are approved and rated 5 (dated ones newest first, then undated ones by `order`); with
  pins it shows exactly those (unapproved pins are dropped). Card text is cut at about 400 characters.
- `site-settings.disclaimers` is a `string[]` in the API. Editors edit it as rows (`disclaimerItems`); a virtual
  field exposes the strings. Writing `disclaimers: string[]` through the API also works.
- `posts.art.cardCrop` is returned as `null` over REST when no crop values are set.
- Rich text uses Lexical limited to what the site renders (`apps/web/src/lib/richtext.ts`): paragraphs, H2 to H4,
  bold/italic/underline/strike/code, lists, links (internal links to pages), quotes, horizontal rules.
- Access: `pages` and `posts` are publicly readable when published (drafts only for signed-in users);
  `authors`, `testimonials`, `media` and both globals are publicly readable; all writes need a signed-in user.
- Preview / live preview buttons open the page on `SITE_URL` (`/`, `/<slug>/`, `/blog/<slug>/`, `/author/<slug>/`). The site is static,
  so they show the last published build, not unsaved drafts.

## Seed

```bash
pnpm --filter cms seed
```

Reads `apps/web/src/content/seed/**/*.json` (`settings.json`, `navigation.json`, `testimonials.json`,
`authors/*.json`, `posts/*.json`, `pages/*.json`) and images from `apps/web/src/assets/seed`:

- `{ "file": "x.webp", "alt": "..." }` -> uploaded to Media once per filename. Later uses reuse that document, so
  one image has one alt text: the first use in seed order wins (globals and pages are read after testimonials,
  authors and posts). Give a reused image the same alt everywhere, or use a separate file.
- Plain-text rich text -> Lexical (blank line = paragraph, `## ` heading, `- ` bullets), same rules as the web app.
- `post.author` (author slug) -> author id; `reviews` block `testimonials` (names) -> testimonial ids.
- Seed testimonials are `source: manual`, `approved: true` and are matched by name among manual testimonials only
  (synced Trustpilot reviews are never touched by the seed).
- Creates the admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` if it does not exist.
- Idempotent: upserts pages/posts/authors by `slug`, testimonials by `name`, media by filename, replaces globals.
  Pages and posts are published. A document that fails validation is saved as a draft and listed at the end.
- Does not trigger the deploy hook.

## Enquiries (leads)

`POST /api/enquiries` with the JSON body from `apps/web/src/lib/forms.ts`. Public users can only create; reading
and editing need a staff login. Admin list columns: name, kind, inquiry type (`topic`), email, phone, status, created.
Kinds: `quote` and `contact` (website forms) and `chat` (created only by the Jivo webhook). Staff work leads
with `status` (new / contacted / quoted / booked / closed) and internal `notes`; submission details (IP, browser,
origin, CRM sync status) are in the sidebar.

Server-side protection for public (not signed-in) requests, in `src/hooks/enquiry.ts`, in this order:

1. Rate limit per IP: `ENQUIRY_RATE_LIMIT` (5) per `ENQUIRY_RATE_WINDOW_MS` (60 s) -> `429`.
   In-memory, per process: behind several instances use the CDN/WAF rate limiting as well.
2. Honeypot `hp` must be empty and `elapsedMs` must be >= 2500 -> otherwise `400 Submission rejected.` and
   **nothing is stored** (chosen over a fake success so genuine users with autofill problems see an error).
3. Cloudflare Turnstile, only when `TURNSTILE_SECRET_KEY` is set: `turnstileToken` is verified with
   Cloudflare -> `400` field error on `turnstileToken`. Fails open (logged) if Cloudflare cannot be reached.
   Set the matching site key as `PUBLIC_TURNSTILE_SITE_KEY` in the web build: the contact form and the quote form's
   contact step then show a visible "verify you are human" widget (create the widget in Cloudflare as **Managed**;
   its script loads only when the form is near the viewport) and require a token before sending. Without the keys
   nothing is shown and the honeypot, timing check and rate limit still apply.
   Cloudflare test keys: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` (always pass).
4. Validation -> `400` Payload `ValidationError` with `errors[0].data.errors = [{ path, message }]`
   (paths like `email`, `legs.0.from`), which `apps/web/src/scripts/enquiry.ts` maps to fields:
   - `quote`: `legs[0].from`, `legs[0].to`, `legs[0].date`, `email` required; extra legs need from/to
     (fully empty extra legs are dropped); up to 6 legs; travellers 0 to 20 each.
   - `quote`: `phone` is required too (every trip type), format checked (7 to 15 digits).
   - `contact`: `firstName`, `email`, and `message` or `subject` required; `topic` is `sales` or `support`
     (default `sales`, anything else is a `400` on `topic`).
   - email and phone format, enum values (`kind`, `tripType`, `cabin`), length limits (names 100, email 254,
     phone 40, subject 200, message 5000, places 120, pageUrl 2000).
   - Unknown fields are dropped; `status`/`notes` cannot be set by the public.

Response `201` = stored. After the response, the lead is forwarded to the CRM and/or emailed (never fails or delays
the request).

### CRM webhook

When `CRM_WEBHOOK_URL` is set, each new enquiry is POSTed as JSON (timeout `CRM_WEBHOOK_TIMEOUT_MS`, 8 s;
`CRM_WEBHOOK_ATTEMPTS`, 3, with 1 s / 3 s backoff; 4xx other than 408/429 is not retried). The result is stored
in the enquiry's "CRM sync" field (sent / failed + error), so failed leads are visible in the admin.

Headers: `Content-Type: application/json`, `X-Flight-Experts-Event: enquiry.created`,
`X-Flight-Experts-Signature: sha256=<hex HMAC-SHA256 of the raw body with CRM_WEBHOOK_SECRET>` (when set),
`Authorization: <CRM_WEBHOOK_AUTH>` (when set).

```json
{
  "event": "enquiry.created",
  "source": "flight-experts-cms",
  "id": 3,
  "createdAt": "2026-09-25T12:53:50.440Z",
  "adminUrl": "https://cms.example.com/admin/collections/enquiries/3",
  "enquiry": {
    "kind": "quote",
    "topic": null,
    "tripType": "multi-city",
    "cabin": "first",
    "legs": [{ "from": "Miami", "to": "Paris", "date": "2026-12-01" }, { "from": "Paris", "to": "Rome", "date": "2026-12-05" }],
    "returnDate": null,
    "travellers": { "adults": 1, "children": 1, "infants": 0 },
    "name": "Multi Leg", "firstName": null, "lastName": null,
    "email": "multi@example.com", "phone": "+1 305 555 0100", "subject": null, "message": null,
    "smsConsent": false,
    "pageUrl": "https://www.flight-experts.com/"
  },
  "meta": { "ip": "203.0.113.7", "userAgent": "Mozilla/5.0 ...", "origin": "https://www.flight-experts.com" }
}
```

Verify the signature in the receiver with `hmac_sha256(secret, rawBody) == header.slice(7)`.
The forward runs in-process after the response: host the CMS as a long-running Node server (not serverless
functions that freeze after responding).

`topic` is `"sales"` or `"support"` for contact messages (null for quotes); chat leads arrive with `"kind": "chat"`.

### Live chat (Jivo)

The site's round chat button (mobile sticky actions) is driven by **Site settings > Live chat**:

- **Provider: None** (seed default): the button opens a small "Chat with us" panel with WhatsApp, call and the quote
  form, so it is never a dead button.
- **Provider: Jivo** + **Jivo widget ID** (the `<ID>` in Jivo's install code `//code.jivosite.com/widget/<ID>`): the
  site loads Jivo's script lazily (first tap on the chat button on mobile; after the page is idle on desktop, where
  Jivo's own launcher is the entry point) and opens the chat with `jivo_api.open()`. Jivo documents no way to hide its
  own launcher, so once Jivo has loaded its launcher takes over and the site's chat button is hidden (never two chat
  buttons). Before that the button is labelled "Chat now" / "Leave a message" from the business hours below, and from
  `jivo_api.chatMode()` once loaded. If Jivo cannot load within 8 s, the built-in panel opens instead.
  Rebuild the site after changing these settings (they are read at build time).
- **Business hours** (timezone, days, open/close) are informational: they label the button before Jivo loads.
  The real schedules live in Jivo, per agent.

Setup in Jivo:

1. Plan: **Jivo Professional** (or Enterprise): business hours, webhooks, JS API and CRM integrations.
2. Optional **AI Agent** add-on (Extensions > Modules) for out-of-hours conversations: upload the FAQ / price
   guidance, instruct it to collect name, phone, email, route, dates, passengers and cabin, and to invite an operator
   when one is online. Confirm with Jivo whether it can be limited to out-of-hours; otherwise run it 24/7 with agents
   taking over in hours.
3. **Business hours per agent** (Settings > Agents > the agent > Business hours, with the time zone). Outside hours
   the widget becomes the offline form (email notification + webhook below).
4. **Webhook**: Jivo "CRM settings" > "CRM webhooks" -> URL
   `https://<cms host>/api/jivo-webhook?secret=<JIVO_WEBHOOK_SECRET>`.

`POST /api/jivo-webhook` (`src/hooks/jivo.ts`): Jivo does not sign webhooks, so the shared secret travels in the URL
(`?secret=`, or an `X-Jivo-Secret` header added by a proxy) and is compared in constant time (`401` if wrong, `503` if
`JIVO_WEBHOOK_SECRET` is unset). `offline_message` and `chat_finished` become an enquiry with `kind: 'chat'` (visitor
name, email, phone, the offline message or the transcript, page URL), which is then forwarded to the CRM and emailed
like every other lead. Other events are acknowledged and ignored; chats without an email or phone are not stored;
repeats of the same event are skipped (`meta.externalId` = `jivo:<event>:<id>`). Responses are `{"result":"ok", ...}`
as Jivo expects.

### Email notification (optional)

Set `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`) to enable
`@payloadcms/email-nodemailer` (also used for admin password resets) and `ENQUIRY_NOTIFY_TO` to receive a plain-text
summary of every new lead (reply-to = the customer). Without SMTP, Payload logs emails to the console.

### CORS / CSRF

`cors` = `SITE_URL` + `SERVER_URL` + `CORS_ORIGINS` (comma list), so the static site can POST from the browser.
Cookie (admin) authentication is only accepted from `SERVER_URL` (+ `CSRF_ORIGINS`), so the site origins cannot make
authenticated requests on a staff member's behalf. Always set `SERVER_URL` in production.

## Trustpilot sync

A scraper (Apify actor, run daily at 6 AM New York time) POSTs the latest Trustpilot reviews to the CMS. They are
stored in **Content > Testimonials** with `source: trustpilot`, **not approved**. Code: `src/hooks/trustpilotSync.ts`.

### Endpoint

```
POST https://<cms-domain>/api/trustpilot-sync
Content-Type: application/json
Authorization: Bearer <TRUSTPILOT_SYNC_SECRET>        (or)  x-sync-secret: <TRUSTPILOT_SYNC_SECRET>
```

Generate the secret with `openssl rand -hex 32`, set it as `TRUSTPILOT_SYNC_SECRET` on the CMS and give it to the
scraper. It is compared in constant time. Send it in a header, never in the URL.

### Request

```ts
{
  actorRunId?: string,   // echoed back and logged (Apify run id)
  datasetId?: string,    // echoed back and logged
  reviews: Review[]      // 0 to 200 items
}
// or just Review[] (a bare array)
```

Limits: at most **200 reviews** and **1 MB** per request (send more as several requests). Each review is an object;
field names are matched leniently (first non-empty wins; dotted = nested):

| Testimonial field | Accepted review fields | Notes |
| --- | --- | --- |
| `reviewId` (**required**) | `reviewId`, `review_id`, `id` | string or number, max 200 chars. The upsert key: send Trustpilot's review id, stable across runs |
| `rating` (**required**) | `rating`, `stars`, `score`, `ratingValue`, `reviewRating.ratingValue` | number or numeric string, rounded, must be 1 to 5 |
| `title` | `title`, `reviewTitle`, `headline` | max 200. If missing: the first sentence of the body |
| `body` | `text`, `body`, `content`, `reviewBody`, `reviewText` | max 5000, line breaks kept. A review needs a body or a title |
| `name` | `author`, `name`, `consumerName`, `reviewer`, `consumer.displayName`, `authorName` (`author`/`reviewer` may be `{ name }` / `{ displayName }`) | max 120. Default "Trustpilot customer" |
| `reviewDate` | `date`, `publishedDate`, `datePublished`, `createdAt`, `dates.publishedDate`, `experienceDate`, `dates.experiencedDate` | ISO string or epoch (s or ms). Invalid dates are ignored |
| `reviewUrl` | `url`, `reviewUrl`, `link` | http(s) only, max 2000 |
| `country` | `country`, `countryCode`, `consumer.countryCode`, `location` | max 60 |
| `language` | `language`, `lang`, `languageCode` | max 20 |
| `replyText` | `replyText`, `reply`, `companyReply`, `response` (string, or object with `text` / `message`) | max 5000 |
| `raw` | the whole review object | stored as is for debugging, staff only (not in the public API) |

All strings are trimmed, HTML tags are stripped (`<br>` and paragraphs become line breaks), entities decoded, control
characters removed, and capped at the lengths above.

Example:

```json
{
  "actorRunId": "HG7ML7M8z78YcAPEB",
  "datasetId": "WkzbQMuFYuamGv3YF",
  "reviews": [
    {
      "id": "66f1d2c3a4b5c6d7e8f90123",
      "rating": 5,
      "title": "Superb service",
      "text": "Andreas found us business class seats to Tokyo for far less than the airline price.",
      "consumer": { "displayName": "Jane Doe", "countryCode": "GB" },
      "dates": { "publishedDate": "2026-10-04T09:15:00.000Z" },
      "url": "https://www.trustpilot.com/reviews/66f1d2c3a4b5c6d7e8f90123",
      "language": "en",
      "companyReply": { "text": "Thank you, Jane!" }
    }
  ]
}
```

### What happens

- Reviews are processed one by one. An invalid review (no `reviewId`, no valid `rating`, no body and no title, not an
  object) is **skipped and listed in `errors`**; it never fails the batch. A review that cannot be saved is also
  skipped and listed.
- **New `reviewId`**: created with `source: trustpilot`, **`approved: false`**, `order: 0`, `lastSyncedAt` = now.
- **Known `reviewId`**: only the synced content (`name`, `title`, `body`, `rating`, `reviewDate`, `reviewUrl`,
  `country`, `language`, `replyText`) is overwritten when it differs, plus `lastSyncedAt` and `raw`.
  **`approved`, `order` and `source` are never changed**, so an approved review stays approved (and a hidden one
  stays hidden). A known `reviewDate` is not cleared by a batch without a date. Edit review wording on Trustpilot,
  not in the CMS: the next sync puts Trustpilot's text back.
- Nothing differs = `unchanged` (only `lastSyncedAt` / `raw` are refreshed, no rebuild).
- If anything was created or updated, the site rebuild (`DEPLOY_HOOK_URL`) is scheduled **once** for the batch (same
  debounce as editor changes). New reviews stay off the site until approved; approving one triggers its own rebuild.
- Reviews removed from Trustpilot are not deleted here; unapprove or delete them in the admin.
- One log line per request: `[trustpilot-sync] run=<actorRunId> dataset=<datasetId> received=.. created=.. updated=..
  unchanged=.. skipped=..` (no secrets or review text).

### Response

`200` (also when some reviews were skipped). `received` = `created + updated + unchanged + skipped`.

```json
{
  "ok": true,
  "received": 3,
  "created": 2,
  "updated": 0,
  "unchanged": 0,
  "skipped": 1,
  "errors": [{ "index": 2, "message": "Missing reviewId (id / reviewId / review_id)" }],
  "actorRunId": "HG7ML7M8z78YcAPEB",
  "datasetId": "WkzbQMuFYuamGv3YF"
}
```

`errors[].index` is the position in `reviews`; `errors[].reviewId` is included when the review had one.

| Status | Body | When |
| --- | --- | --- |
| `400` | `{ "ok": false, "error": "Invalid JSON." }` (or `"Expected { \"reviews\": [...] } or an array of reviews."`) | body is not JSON, or not `{ "reviews": [...] }` / an array |
| `401` | `{ "ok": false, "error": "Unauthorized" }` | missing or wrong secret |
| `413` | `{ "ok": false, "error": "..." }` | body over 1 MB, or more than 200 reviews |
| `503` | `{ "ok": false, "error": "Trustpilot sync is not configured ..." }` | `TRUSTPILOT_SYNC_SECRET` is not set on the CMS |

The scraper should retry on `5xx` / network errors (re-sending the same batch is safe: it is idempotent) and not on
`4xx`.

### Approving reviews (editors)

- **Content > Testimonials**: columns name, rating, source, approved, review date (newest first). Click the
  **Approved** switch in a row to approve or hide a review; it saves immediately.
- Many at once: tick the rows, **Edit** (bulk) > choose **Approved** > tick > Save. Filter with **Filters** >
  Approved / Source / Rating, or open `/admin/collections/testimonials?where[approved][equals]=false` for the queue.
- The site shows approved **5-star** reviews only (4-star and lower can be approved but are not pulled
  automatically; they show only if pinned on a Reviews block). Newest `reviewDate` first, then manual testimonials
  (no date) by `order`, up to the block's `limit` (8).
- To show a fixed set instead, pick testimonials in the Reviews block's **Pinned testimonials** (page editor).
  Clear the pins to go back to automatic.
- Approving or editing a testimonial triggers the site rebuild (debounced).

### Testing with curl

```bash
CMS=http://localhost:3000            # or https://<cms-domain>
SECRET=...                           # TRUSTPILOT_SYNC_SECRET

# 401 without / with a wrong secret
curl -i -X POST "$CMS/api/trustpilot-sync" -H 'Content-Type: application/json' -d '{"reviews":[]}'

# one review (run twice: created 1, then unchanged 1)
curl -s -X POST "$CMS/api/trustpilot-sync" \
  -H "Authorization: Bearer $SECRET" -H 'Content-Type: application/json' \
  -d '{"actorRunId":"manual-test","reviews":[{"id":"test-1","rating":5,"title":"Great","text":"Very helpful team.","consumer":{"displayName":"Test User"},"dates":{"publishedDate":"2026-10-01T10:00:00Z"}}]}'

# a saved Apify dataset (bare array) from a file
curl -s -X POST "$CMS/api/trustpilot-sync" -H "x-sync-secret: $SECRET" -H 'Content-Type: application/json' --data-binary @reviews.json
```

Then approve "Test User" in the admin and delete it when done.

## Rebuilding the static site

`pages`, `posts`, `authors`, `testimonials`, `media` (updates) and both globals call `DEPLOY_HOOK_URL` (POST,
JSON `{ source, reason, at }`) after a change goes live: publishing, unpublishing, deleting, or editing a
non-draft collection. Saving a draft does nothing. Calls are debounced (`DEPLOY_HOOK_DEBOUNCE_MS`, 15 s), so a burst
of edits triggers one build. Use the build hook URL of the host that builds `apps/web` (Netlify, Vercel,
Cloudflare Pages ...), with `PAYLOAD_URL` set to the CMS URL in that build's environment.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PAYLOAD_SECRET` | yes | | Signs sessions. Long random string. |
| `DATABASE_URI` | | `file:./flight-experts.db` | SQLite file or `postgres://` URL |
| `DATABASE_AUTH_TOKEN` | | | libSQL/Turso token for remote SQLite |
| `DB_PUSH` | | `true` (dev) | `false` disables dev schema push |
| `SERVER_URL` | prod | `http://localhost:$PORT` | Public CMS URL: absolute media URLs, admin CSRF origin, admin links |
| `PORT` | | `3000` | |
| `SITE_URL` | prod | `http://localhost:4321` | Astro site origin: preview links, CORS |
| `CORS_ORIGINS` | | | Extra browser origins allowed to call the API (comma list) |
| `CSRF_ORIGINS` | | | Extra origins whose admin cookies are accepted |
| `MEDIA_DIR` | | `apps/cms/media` | Local upload folder |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | seed | | First admin user |
| `SEED_DIR` / `SEED_ASSETS_DIR` | | `apps/web/src/content/seed`, `apps/web/src/assets/seed` | Seed sources |
| `DEPLOY_HOOK_URL` | | | Static site build hook |
| `DEPLOY_HOOK_DEBOUNCE_MS` | | `15000` | |
| `CRM_WEBHOOK_URL` | | | Lead forwarding endpoint |
| `CRM_WEBHOOK_SECRET` | | | HMAC signing secret |
| `CRM_WEBHOOK_AUTH` | | | `Authorization` header value |
| `CRM_WEBHOOK_TIMEOUT_MS` / `CRM_WEBHOOK_ATTEMPTS` | | `8000` / `3` | |
| `TURNSTILE_SECRET_KEY` | | | Enables Turnstile verification (site key goes in the web app as `PUBLIC_TURNSTILE_SITE_KEY`). Test secret: `1x0000000000000000000000000000000AA` |
| `JIVO_WEBHOOK_SECRET` | | | Shared secret for `POST /api/jivo-webhook?secret=...` (live chat leads) |
| `TRUSTPILOT_SYNC_SECRET` | | | Shared secret for `POST /api/trustpilot-sync` (Trustpilot reviews). `openssl rand -hex 32` |
| `ENQUIRY_RATE_LIMIT` / `ENQUIRY_RATE_WINDOW_MS` | | `5` / `60000` | Public enquiry rate limit per IP |
| `TRUSTED_PROXY_HOPS` | | `1` | Proxies in front of the CMS, for `X-Forwarded-For` (CF-Connecting-IP / X-Real-IP win) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME` | | | Email adapter |
| `ENQUIRY_NOTIFY_TO` | | | New-lead notification recipient(s) |

## Deploying

- **Runtime**: Node 20+, `pnpm --filter cms build` then `pnpm --filter cms start` (long-running process, e.g. a
  small VM, Render, Railway, Fly.io). `next build` needs about 3 GB of memory (`--max-old-space-size=3072` is set).
- **Database**: managed Postgres (`DATABASE_URI=postgres://...`), with migrations committed and run on deploy.
- **Media**: local disk is fine for one server with a persistent volume. For anything else use object storage:
  `@payloadcms/storage-s3` (S3, Cloudflare R2, DigitalOcean Spaces) or `@payloadcms/storage-vercel-blob`, e.g.

  ```ts
  import { s3Storage } from '@payloadcms/storage-s3'
  plugins: [s3Storage({ collections: { media: true }, bucket: process.env.S3_BUCKET!, config: { region, endpoint, credentials } })]
  ```

  Keep the media host in the Astro build's allowed image domains (`apps/web/astro.config.mjs` allows the
  `PAYLOAD_URL` host; add the bucket/CDN host if media URLs point there).
- Set `SERVER_URL`, `SITE_URL` (production site origin), `PAYLOAD_SECRET`, `DEPLOY_HOOK_URL`, `CRM_WEBHOOK_URL`,
  `TRUSTPILOT_SYNC_SECRET`, and optionally `TURNSTILE_SECRET_KEY` and SMTP.
- The web build needs `PAYLOAD_URL` (content) and `PUBLIC_FORMS_ENDPOINT` (if the browser-facing CMS URL differs).
