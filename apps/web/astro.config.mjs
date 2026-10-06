// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// On Vercel, SITE_URL defaults to the project's production domain (e.g. flight-experts.vercel.app).
const SITE =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://www.flight-experts.com');
const CMS = process.env.PAYLOAD_URL ? new URL(process.env.PAYLOAD_URL) : null;

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  image: {
    // CMS media is optimised at build time
    remotePatterns: [
      ...(CMS ? [{ protocol: CMS.protocol.replace(':', ''), hostname: CMS.hostname, port: CMS.port || undefined }] : []),
      // CMS media stored in Vercel Blob
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
    responsiveStyles: false,
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/(thank-you|404)\/?$/.test(page),
    }),
  ],
  vite: { build: { assetsInlineLimit: 2048 } },
});
