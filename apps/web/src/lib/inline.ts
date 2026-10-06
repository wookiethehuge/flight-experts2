/**
 * Tiny inline formatter for editor-typed strings (see types.ts `Inline`).
 *   *italic*   **bold**   [label](https://url)   newline -> <br>   phone numbers wrapped in <span class="nowrap">
 * Everything else is HTML-escaped, so editors cannot inject markup.
 */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(src: string | undefined | null, opts: { breaks?: boolean } = {}): string {
  if (!src) return '';
  const { breaks = true } = opts;
  let out = esc(src);
  // links first so their labels can still carry emphasis
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const safe = /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : '#';
    const ext = /^https?:/i.test(safe) ? ' rel="noopener"' : '';
    return `<a href="${safe}"${ext}>${label}</a>`;
  });
  // phone numbers never break across lines: "(888) 855-2389", "+1 (888) 855-2389"
  out = out.replace(/(\+\d{1,3}\s?)?\(\d{3}\)\s?\d{3}-\d{4}/g, '<span class="nowrap">$&</span>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = breaks ? out.replace(/\r?\n/g, '<br>') : out.replace(/\r?\n/g, ' ');
  return out;
}

/** Plain text (for alt text, meta tags, aria labels). */
export function plain(src: string | undefined | null): string {
  if (!src) return '';
  return src.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s*\r?\n\s*/g, ' ').trim();
}
