# Flight Experts site build: brief for build agents

Repo: `/home/claude/flight-experts` (pnpm workspace). `apps/web` = Astro 5 static site. `apps/cms` = Payload 3 CMS.
Scratch tools/reference: `/tmp/claude-0/-home-claude/bbbc0554-7879-53c2-9195-00044e819639/scratchpad` (below: `$S`).

## Goal
Production-quality Astro front end that matches the approved designs exactly at the two designed widths
(mobile 390, desktop 1440) and stays clean and fluid at EVERY width from 320px up. Lead-gen site: forms and speed
matter. Zero JS by default; small vanilla `<script>` islands only where interaction is needed. WCAG 2.1 AA.
Core Web Vitals on mobile: LCP < 2.5s, CLS < 0.1, INP < 200ms.

## Design references (source of truth, in priority order)
1. Design artboards `$S/pub/project/<Name>.dc.html`: pixel-accurate HTML of every frame, absolute px values
   (fonts, sizes, weights, colours, line heights, radii, shadows, copy, links). READ THEM for exact values.
   Desktop: Main (home), HomeContact (home contact step), Contact, About, ThankYou, BlogCollection, BlogArticle,
   Author, TextPage. Mobile: Mobile (home), MobileContact, MobileBooking (booking modal), ContactMobile, AboutMobile,
   ThankYouMobile, BlogCollectionMobile, BlogArticleMobile, AuthorMobile, TextPageMobile.
   Menus: Main/Mobile etc. contain the menu under `<sc-if value="{{menuOpen}}">`. Form states in Main: `tripOpen`,
   `isMulti`, `popupOpen`. Render any artboard/state: `python3 $S/render2.py <Name> out.png '{"menuOpen":true,"_dpr":2}'`.
   Their generators (`$S/gen_home.py`, `$S/gen_*.py`, `$S/kit.py`, `$S/lightkit.py`) show how values were derived.
   `/_blob/<id>` asset ids map to local files in `$S/blobs.txt` (and render2.py's map).
2. The Figma PDF exports and extracted data: `$S/pg/<code>/` (`full-1.png` 2x render, `spans.txt` exact font sizes
   and baselines, `draw.txt` shapes/colours, `images.json`). Codes: ty/tym thank you, ba/bam blog article,
   bc/bcm blog collection, tx/txm text page, ct/ctm contact, ab/abm about, au/abm1 author, hm2 mobile booking modal.
   Home: `$S/mob/m.pdf` (mobile), `$S/mob/m1.pdf` (mobile contact step). Figma component SVGs: `$S/zip/`
   (Drop down button active.svg = trip menu, Traveller number pop up.svg, Dates pop up.svg, Input form.svg ...).
3. Screenshots of desktop form states: `/root/.claude/uploads/bbbc0554-7879-53c2-9195-00044e819639/`
   `c65d36d2-image.png` (multi-city), `9dc251be-image.png` (contact extension), `2915f600-image.png` (booking popup).

Never invent design values. If frames disagree or a state/breakpoint is missing, choose the most consistent option,
note it as a QUESTION in your final report. Use the real copy (Figma lorem ipsum is the current copy; keep it).
Do not create, crop or fabricate images: use the assets in `apps/web/src/assets/seed/` (already collected).

## Code conventions (must follow)
- Styling: CSS custom properties in `src/styles/tokens.css` + scoped `<style>` in each .astro component. No Tailwind,
  no inline style attributes (except dynamic values), no hard-coded brand colours or font stacks: use tokens
  (`var(--c-navy)`, `var(--ff-serif)` ...). Component-specific sizes may be local custom properties.
- Mobile first: base styles = the 390 design; layer up with `@media (min-width: 48rem)` (768), `64rem` (1024),
  `80rem` (1280). At >= 1440 match the desktop frame exactly; content max width 1440 (`.container` gives the
  20->70px gutter). Between the designed widths use fluid values: `node apps/web/scripts/fluid.mjs <390px> <1440px>`
  prints the clamp(). Tablet (768-1023) has no design: reflow sensibly (2-column grids, stacked hero etc.).
  Absolutely NO horizontal overflow at any width from 320 to 1920 (check with sweep.py).
- Use rem for font sizes (1rem = 16px); px fine for borders/radii/small offsets.
- Semantic HTML, one h1 per page, correct heading order, landmarks, real buttons/links/inputs with labels,
  visible focus (global focus-visible style exists; on light backgrounds add `class="on-light"` on a wrapper or use
  `focus-dark` class), `details/summary` or buttons with aria-expanded for disclosure, alt text from media.alt.
  Touch targets >= 44px where the design allows (extend hit area with padding/pseudo-elements if the visual is smaller).
- Images: always `<Img media={...} sizes="..." />` (src/components/ui/Img.astro) with an accurate `sizes`.
  LCP image (hero): `loading="eager" fetchpriority="high"`. Everything else lazy. Never raw <img> for photos.
- Icons: `<Icon name="phone" />` (src/components/ui/Icon.astro, paths in icons.ts). To add an icon, extract the vector
  (`python3 $S/svgpath.py <pdf> x y w h`) and ADD an entry to icons.ts with the Edit tool (never rewrite the file).
- Content: pages read content through `src/lib/cms.ts` (Payload REST or seed fallback). Contract in
  `src/lib/types.ts`. Seed files in `src/content/seed/**` use the same shapes; images in seed are written as
  `{ "file": "<name in src/assets/seed>", "alt": "..." }`; rich text may be plain text (blank line = paragraph,
  `## ` heading, `- ` bullets). Editor-typed short strings use the inline syntax (*italic*, **bold**, [a](url), \n):
  render with `set:html={inline(value)}` from `src/lib/inline.ts`.
- Every block component: `interface Props { block: <XBlock>; settings: SiteSettings; page: string; index: number }`.
- Scripts: `<script>` in .astro (bundled, deferred). No frameworks, no jQuery. Keep JS tiny.
- Forms post via `src/scripts/enquiry.ts` (`submitEnquiry`) to the contract in `src/lib/forms.ts`; include
  `<Honeypot />`; set `data-endpoint={FORMS_ENDPOINT}` on the <form>. Success -> `/thank-you/`.

## Shared files: ownership
Read-only for everyone except the lead: `tokens.css`, `global.css`, `BaseLayout.astro`, `cms.ts`, `forms.ts`,
`enquiry.ts`, `inline.ts`, `richtext.ts`, `Img.astro`, `Icon.astro`, `BlockRenderer.astro`, `pages/[...slug].astro`,
`astro.config.mjs`, `package.json`. If you truly need a change there, make the smallest possible Edit and list it in your
report. `types.ts`: you may Edit (never Write) ONLY the interfaces of blocks you own, only additively where possible.
`icons.ts`: add entries with Edit. Only touch files listed as yours.
Do not run `pnpm build` (the lead builds). Do not install packages without listing them in your report.

## Running and checking your work
- Dev server: `cd /home/claude/flight-experts/apps/web && pnpm astro dev --port <YOUR PORT> --host 127.0.0.1`
  (run in background, e.g. `nohup ... > /tmp/dev-<port>.log 2>&1 &`). Pages: http://127.0.0.1:<port>/...
- Visual diff vs design (REQUIRED at 390 and 1440 for every page you own):
  `python3 $S/cmp_site.py http://127.0.0.1:<port>/<path> <Artboard> 1440 /tmp/<you>/d` then Read the slices
  (design left, site right). Iterate until they match (within ~2px; text wraps the same).
- Responsive sweep (REQUIRED): `python3 $S/sweep.py http://127.0.0.1:<port>/<path> /tmp/<you>/s` must print OK at
  every width; look at the 768/1024 thumbnails to make sure tablet layouts look intentional.
- Stop your dev server when done.

## Final report (your last message)
Files created/changed; what is done; anything not done; QUESTIONS (design conflicts/missing states); any
shared-file edits; packages added. Keep it concise.
