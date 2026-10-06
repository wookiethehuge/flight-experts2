/**
 * Staging / preview builds must not be indexed. NOINDEX is on when SITE_NOINDEX=1, on any Vercel preview deploy, or
 * when the site runs on a *.vercel.app address (the test URL). Set SITE_NOINDEX=0 to force indexing.
 */
const site = (import.meta.env.SITE as string | undefined) ?? '';
const flag = process.env.SITE_NOINDEX;
export const NOINDEX =
  flag === '0' ? false : flag === '1' || process.env.VERCEL_ENV === 'preview' || /\.vercel\.app\/?$/i.test(site);
