/**
 * Airport autosuggest for the From / To fields (quote form, booking modal, multi-city legs).
 * Data: /data/airports.json, built from OurAirports (public domain): large + medium airports with an IATA code and
 * scheduled service, one row per airport: [IATA, city, airport name, country, large ? 1 : 0]. Fetched once, on the
 * first focus of a field, so it never weighs on page load.
 * Matching ignores accents and case: IATA code, city, airport name words and country. Exact code first, then
 * city / name starting with the text, then words starting with it, big airports before small ones.
 * The list is an ARIA combobox popup (arrows / Enter / Escape), shown in the top layer (popover) so it also works
 * inside the booking dialog; a pick writes "Airport name (IATA)" and the input keeps working as free text.
 */
type Row = [string, string, string, string, number];
interface Entry { row: Row; code: string; city: string; name: string; words: string[]; country: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let data: Promise<Entry[]> | null = null;
const load = () =>
  (data ??= fetch('/data/airports.json')
    .then((r) => r.json() as Promise<Row[]>)
    .then((rows) => rows.map((row) => {
      const name = fold(row[2]);
      return { row, code: row[0].toLowerCase(), city: fold(row[1]), name, words: name.split(/[\s\-/().]+/).filter(Boolean), country: fold(row[3]) };
    }))
    .catch(() => { data = null; return []; }));

function search(list: Entry[], q: string, max = 8): Row[] {
  const t = fold(q.trim());
  if (t.length < 2) return [];
  const scored: [number, Entry][] = [];
  for (const e of list) {
    let s = 0;
    if (e.code === t) s = 100;
    else if (e.city.startsWith(t)) s = 60;
    else if (e.name.startsWith(t)) s = 55;
    else if (e.words.some((w) => w.startsWith(t))) s = 40;
    else if (t.length >= 3 && e.code.startsWith(t)) s = 35;
    else if (e.country.startsWith(t)) s = 15;
    else if (t.length >= 4 && (e.name.includes(t) || e.city.includes(t))) s = 10;
    if (s) scored.push([s + e.row[4] * 8, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, max).map(([, e]) => e.row);
}

const label = (r: Row) => `${r[2].replace(/\s+(International\s+)?Airport$/i, '')} (${r[0]})`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let uid = 0;
export function initAirportSuggest(root: HTMLElement) {
  const list = document.createElement('ul');
  list.className = 'ap-list';
  list.id = `ap-list-${++uid}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  const popover = 'popover' in HTMLElement.prototype;
  if (popover) list.setAttribute('popover', 'manual');
  (root.closest('dialog') ?? document.body).append(list);

  let input: HTMLInputElement | null = null;
  let rows: Row[] = [];
  let active = -1;
  let seq = 0;

  const place = () => {
    if (!input) return;
    const field = input.closest<HTMLElement>('.qf__row, .qf__mrow') ?? input;
    const r = field.getBoundingClientRect();
    Object.assign(list.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${r.width}px` });
  };
  const show = (on: boolean) => {
    list.hidden = !on;
    if (popover) { try { on ? list.showPopover() : list.hidePopover(); } catch { /* already in that state */ } }
    input?.setAttribute('aria-expanded', String(on));
    if (on) place();
  };
  const paint = () => {
    list.innerHTML = rows.map((r, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}">
      <span class="ap-code">${r[0]}</span><span class="ap-txt"><span class="ap-name">${esc(r[2])}</span><span class="ap-sub">${esc(r[1])}, ${esc(r[3])}</span></span></li>`).join('');
    if (active >= 0) input?.setAttribute('aria-activedescendant', `${list.id}-${active}`); else input?.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i: number) => {
    const r = rows[i];
    if (!r || !input) return;
    input.value = label(r);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    rows = []; show(false);
  };
  const update = async () => {
    if (!input) return;
    const me = ++seq; const q = input.value;
    const all = await load();
    if (me !== seq) return;
    rows = search(all, q); active = -1;
    paint(); show(rows.length > 0);
  };

  root.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement) || !/^(from|to)$/.test(el.dataset.field ?? '')) return;
    input = el;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', list.id);
    el.setAttribute('aria-expanded', 'false');
    void load();
  });
  root.addEventListener('input', (e) => { if (e.target === input && e.isTrusted) void update(); });
  root.addEventListener('keydown', (e) => {
    if (e.target !== input || list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      paint();
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.stopPropagation(); show(false); }
  });
  root.addEventListener('focusout', (e) => {
    if (e.target === input && !list.contains(e.relatedTarget as Node)) setTimeout(() => show(false), 120);
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault());   // keep focus in the input
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (li) pick(Number(li.dataset.i));
  });
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
}
