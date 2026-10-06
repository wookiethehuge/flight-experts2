/**
 * Plain text -> Lexical JSON, same rules as lexicalFromText in apps/web/src/lib/richtext.ts:
 * blank line = paragraph, '## ' / '### ' / '#### ' heading, a block where every line starts with '- ' = bullet list.
 * Single newlines inside a paragraph become spaces. Nodes carry the full set of Lexical properties so the
 * admin editor can load them.
 */
const text = (s: string) => ({ type: 'text', text: s, format: 0, style: '', mode: 'normal', detail: 0, version: 1 })
const base = { format: '', indent: 0, version: 1, direction: 'ltr' as const }

export function lexicalFromText(src: string) {
  const blocks = src.trim().split(/\n\s*\n/).filter((b) => b.trim())
  const children = blocks.map((b) => {
    const lines = b.split('\n')
    if (lines.every((l) => l.startsWith('- '))) {
      return {
        ...base,
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        children: lines.map((l, i) => ({ ...base, type: 'listitem', value: i + 1, children: [text(l.slice(2))] })),
      }
    }
    const m = b.match(/^(#{2,4}) (.*)$/s)
    if (m) return { ...base, type: 'heading', tag: `h${m[1].length}`, children: [text(m[2].trim())] }
    return { ...base, type: 'paragraph', textFormat: 0, textStyle: '', children: [text(b.replace(/\n/g, ' '))] }
  })
  return { root: { ...base, type: 'root', children } }
}

/** Plain text of a Lexical document (for word counts). */
export function lexicalPlain(value: unknown): string {
  const walk = (n: any): string => (n?.type === 'text' ? (n.text ?? '') : (n?.children ?? []).map(walk).join(' '))
  const root = (value as { root?: unknown } | null)?.root
  return root ? walk(root).replace(/\s+/g, ' ').trim() : ''
}
