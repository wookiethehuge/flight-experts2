/**
 * Minimal, dependency-free renderer for Payload Lexical rich text -> HTML.
 * Supports: paragraph, heading (h2-h6), list (bullet/number, nested), listitem, quote, link/autolink,
 * linebreak, horizontalrule and text formats (bold, italic, underline, strikethrough, code).
 */
import type { RichText } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FORMAT = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16 };

function text(node: any): string {
  let t = esc(node.text ?? '');
  const f = node.format ?? 0;
  if (f & FORMAT.code) t = `<code>${t}</code>`;
  if (f & FORMAT.bold) t = `<strong>${t}</strong>`;
  if (f & FORMAT.italic) t = `<em>${t}</em>`;
  if (f & FORMAT.underline) t = `<u>${t}</u>`;
  if (f & FORMAT.strikethrough) t = `<s>${t}</s>`;
  return t;
}

function linkHref(node: any): string {
  const f = node.fields ?? {};
  let url: string = f.url ?? node.url ?? '#';
  if (f.linkType === 'internal' && f.doc?.value?.slug) url = `/${f.doc.value.slug === 'home' ? '' : f.doc.value.slug}`;
  return /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : '#';
}

function children(node: any): string {
  return (node.children ?? []).map(render).join('');
}

function render(node: any): string {
  switch (node.type) {
    case 'root': return children(node);
    case 'text': return text(node);
    case 'linebreak': return '<br>';
    case 'tab': return ' ';
    case 'paragraph': {
      const inner = children(node);
      return inner ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const tag = /^h[2-6]$/.test(node.tag) ? node.tag : 'h2';
      return `<${tag}>${children(node)}</${tag}>`;
    }
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      return `<${tag}>${children(node)}</${tag}>`;
    }
    case 'listitem': return `<li>${children(node)}</li>`;
    case 'quote': return `<blockquote>${children(node)}</blockquote>`;
    case 'horizontalrule': return '<hr>';
    case 'link':
    case 'autolink': {
      const href = linkHref(node);
      const ext = /^https?:/i.test(href) && node.fields?.newTab ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(href)}"${ext}>${children(node)}</a>`;
    }
    default:
      return children(node);
  }
}

export function richText(value: RichText | null | undefined): string {
  if (!value?.root) return '';
  return render(value.root);
}

/** Plain-text word count (for read time and meta descriptions). */
export function richTextPlain(value: RichText | null | undefined): string {
  const walk = (n: any): string => (n.type === 'text' ? n.text ?? '' : (n.children ?? []).map(walk).join(' '));
  return value?.root ? walk(value.root).replace(/\s+/g, ' ').trim() : '';
}

/** Build Lexical JSON from simple markdown-ish text (used by seed data): blank line = paragraph,
 *  '## ' heading, '- ' bullets. Keeps seed files readable. */
export function lexicalFromText(src: string): RichText {
  const blocks = src.trim().split(/\n\s*\n/);
  const t = (s: string) => ({ type: 'text', text: s, format: 0, version: 1, detail: 0, mode: 'normal', style: '' });
  const children = blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => l.startsWith('- '))) {
      return { type: 'list', listType: 'bullet', tag: 'ul', start: 1, version: 1, children: lines.map((l, i) => ({ type: 'listitem', value: i + 1, version: 1, children: [t(l.slice(2))] })) };
    }
    const m = b.match(/^(#{2,4}) (.*)$/s);
    if (m) return { type: 'heading', tag: `h${m[1].length}`, version: 1, children: [t(m[2].trim())] };
    return { type: 'paragraph', version: 1, children: [t(b.replace(/\n/g, ' '))] };
  });
  return { root: { type: 'root', version: 1, children } } as RichText;
}
