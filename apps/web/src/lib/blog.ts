/** Blog helpers shared by the blog index, paginated pages and article pages. */
import type { Post } from './types';

/** Posts per blog index page (BlogCollection shows two rows of four). */
export const POSTS_PER_PAGE = 8;

/** URL of blog index page n: page 1 is the index itself. */
export const pageHref = (n: number, base = '/blog/') => (n <= 1 ? base : `${base}page/${n}/`);

export const pageCount = (posts: Post[]) => Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));

export const pageSlice = (posts: Post[], page: number) => posts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

/** "20 December 2026" (article byline; cards use formatDate's ordinal form). */
export const bylineDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
