import type { APIRoute } from 'astro';
import { NOINDEX } from '../lib/env';
// /thank-you/ is not disallowed on purpose: it carries <meta name="robots" content="noindex">, which crawlers can only
// see if they may fetch the page (it is also left out of the sitemap).
// Staging (see lib/env.ts): block all crawling.
export const GET: APIRoute = ({ site }) =>
  NOINDEX
    ? new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } })
    : new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`, { headers: { 'Content-Type': 'text/plain' } });
