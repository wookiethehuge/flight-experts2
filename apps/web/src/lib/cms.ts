/**
 * Content loading. At build time the site reads Payload's REST API (PAYLOAD_URL). If PAYLOAD_URL is not set the site
 * falls back to the seed files in src/content/seed (same shapes; the CMS seed script imports the same files), so the
 * front end can be built and previewed without a running CMS.
 */
import type { Author, Navigation, Page, Post, SiteSettings, Testimonial, Media } from './types';
import { lexicalFromText } from './richtext';

const CMS_URL = (import.meta.env.PAYLOAD_URL ?? process.env.PAYLOAD_URL ?? '').replace(/\/$/, '');
export const usingCms = Boolean(CMS_URL);
export const cmsUrl = CMS_URL;

// ------------------------------------------------------------------ Payload REST
async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${CMS_URL}/api/${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CMS ${res.status} for /api/${path}`);
  return (await res.json()) as T;
}
const absolutise = (m: any) => {
  if (m && typeof m === 'object' && typeof m.url === 'string' && m.url.startsWith('/api/')) m.url = CMS_URL + m.url;
  return m;
};
function walkMedia(v: any): any {
  if (Array.isArray(v)) return v.map(walkMedia);
  if (v && typeof v === 'object') {
    if ('mimeType' in v && 'url' in v) return absolutise(v);
    for (const k of Object.keys(v)) v[k] = walkMedia(v[k]);
  }
  return v;
}

// ------------------------------------------------------------------ seed fallback
const seedFiles = import.meta.glob('../content/seed/**/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const seedAssets = import.meta.glob('../assets/seed/*', { eager: true, import: 'default' }) as Record<string, ImageMetadata | string>;

function seed(path: string): any {
  const hit = seedFiles[`../content/seed/${path}.json`];
  if (!hit) throw new Error(`Missing seed file src/content/seed/${path}.json`);
  return structuredClone(hit);
}
function seedDir(dir: string): any[] {
  return Object.entries(seedFiles)
    .filter(([k]) => k.startsWith(`../content/seed/${dir}/`))
    .map(([, v]) => structuredClone(v));
}

/** Seed shorthand -> Media: { "file": "hero-desktop.webp", "alt": "..." } */
function seedMedia(v: any): any {
  if (Array.isArray(v)) return v.map(seedMedia);
  if (v && typeof v === 'object') {
    if (typeof v.file === 'string' && 'alt' in v && Object.keys(v).length <= 3) {
      const asset = seedAssets[`../assets/seed/${v.file}`];
      if (!asset) throw new Error(`Seed image not found: src/assets/seed/${v.file}`);
      const meta = typeof asset === 'string' ? undefined : asset;
      return { url: `/seed/${v.file}`, alt: v.alt ?? '', width: meta?.width, height: meta?.height, filename: v.file } satisfies Media;
    }
    for (const k of Object.keys(v)) v[k] = seedMedia(v[k]);
  }
  return v;
}
/** Seed rich text may be written as plain text (see lexicalFromText). */
const seedRich = (v: any) => (typeof v === 'string' ? lexicalFromText(v) : v);

export function seedAsset(url: string): ImageMetadata | string | undefined {
  if (!url.startsWith('/seed/')) return undefined;
  return seedAssets[`../assets/seed/${url.slice(6)}`];
}

// ------------------------------------------------------------------ public API (cached per build)
const cache = new Map<string, Promise<any>>();
const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key)!;
};

export const getSettings = () =>
  once<SiteSettings>('settings', async () => (usingCms ? walkMedia(await api('globals/site-settings?depth=2')) : seedMedia(seed('settings'))));

export const getNavigation = () =>
  once<Navigation>('navigation', async () => (usingCms ? await api('globals/navigation?depth=1') : seed('navigation')));

export const getTestimonials = () =>
  once<Testimonial[]>('testimonials', async () => (usingCms ? (await api<any>('testimonials?limit=100&sort=order')).docs : seed('testimonials')));

/**
 * Reviews for Reviews blocks without pinned testimonials: approved, 5 stars, newest first. Dated reviews (synced from
 * Trustpilot) come before undated ones (typed in), which keep their `order`. Sorted here as well because databases
 * place empty dates differently (Postgres puts NULLs first in a descending sort).
 */
export const getLatestReviews = () =>
  once<Testimonial[]>('latest-reviews', async () => {
    const list: Testimonial[] = usingCms
      ? (await api<any>('testimonials?limit=100&depth=0&where[approved][equals]=true&where[rating][equals]=5&sort=-reviewDate')).docs
      : (await getTestimonials()).filter((t) => t.approved === true && t.rating === 5);
    const time = (t: Testimonial) => (t.reviewDate ? +new Date(t.reviewDate) || 0 : 0);
    return list
      .map((t, i) => ({ t, i }))
      .sort((a, b) => time(b.t) - time(a.t) || (a.t.order ?? 0) - (b.t.order ?? 0) || a.i - b.i)
      .map(({ t }) => t);
  });

export const REVIEWS_LIMIT = 8;

/** Reviews block: the pinned testimonials (minus unapproved ones), or else the newest `limit` approved 5-star reviews. */
async function resolveReviews(block: any) {
  const pinned = (Array.isArray(block.testimonials) ? block.testimonials : []).filter(
    (t: any) => t && typeof t === 'object' && t.approved !== false,
  );
  const limit = Math.min(24, Math.max(1, Math.round(Number(block.limit) || REVIEWS_LIMIT)));
  block.testimonials = pinned.length ? pinned : (await getLatestReviews()).slice(0, limit);
  return block;
}

export const getAuthors = () =>
  once<Author[]>('authors', async () =>
    usingCms ? walkMedia((await api<any>('authors?limit=100&depth=2')).docs) : seedMedia(seedDir('authors')));

export const getPosts = () =>
  once<Post[]>('posts', async () => {
    let posts: Post[];
    if (usingCms) {
      posts = walkMedia((await api<any>('posts?limit=1000&depth=2&sort=-publishedAt&where[_status][equals]=published')).docs);
    } else {
      const authors = await getAuthors();
      posts = seedMedia(seedDir('posts')).map((p: any) => ({
        ...p,
        content: seedRich(p.content),
        author: typeof p.author === 'string' ? authors.find((a) => a.slug === p.author) : p.author,
      }));
    }
    return posts.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt) || a.slug.localeCompare(b.slug));
  });

export const getPages = () =>
  once<Page[]>('pages', async () => {
    let pages: Page[];
    if (usingCms) pages = walkMedia((await api<any>('pages?limit=200&depth=2&where[_status][equals]=published')).docs);
    else {
      const testimonials = await getTestimonials();
      pages = seedMedia(seedDir('pages')).map((p: any) => ({
        ...p,
        layout: (p.layout ?? []).map((b: any) => {
          if (b.blockType === 'reviews' && Array.isArray(b.testimonials))
            b.testimonials = b.testimonials.map((t: any) => (typeof t === 'string' ? testimonials.find((x) => x.name === t) : t)).filter(Boolean);
          if (b.blockType === 'richText') b.content = seedRich(b.content);
          return b;
        }),
      }));
    }
    for (const p of pages) for (const b of p.layout ?? []) if (b.blockType === 'reviews') await resolveReviews(b);
    return pages;
  });

export async function getPage(slug: string): Promise<Page> {
  const page = (await getPages()).find((p) => p.slug === slug);
  if (!page) throw new Error(`Page not found: ${slug}`);
  return page;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^(\d+)/, (d) => d + ordinal(+d));
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
