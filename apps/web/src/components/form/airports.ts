/**
 * Airport autosuggest for the From / To fields (quote form, booking modal, multi-city legs).
 * Data: /data/airports.json, built from OurAirports (public domain): large + medium airports with an IATA code and
 * scheduled service, one row per airport: [IATA, city, airport name, country, large ? 1 : 0]. Fetched once, on the
 * first focus of a field, so it never weighs on page load.
 * Matching ignores accents and case: IATA code, city, airport name words and country. Exact code first, then
 * city / name starting with the text, then words starting with it, big airports before small ones.
 * The list is an ARIA combobox popup (arrows / Enter / Escape), shown in the top layer (popover) so it also works
 * inside the booking dialog; a pick writes "Airport name (IATA)" (or "London, all airports (LON)" for a city) and the
 * input keeps working as free text.
 * Layout follows the client's reference (travelbusinessclass.com): a city with several airports comes first with its
 * metro code, its airports indented under it; other matches are single airport rows.
 */
type Row = [string, string, string, string, number];
interface Entry { row: Row; code: string; city: string; name: string; words: string[]; country: string }
/** One line of the list: a whole city (all its airports) or one airport, which may sit indented under its city. */
interface Item { kind: 'city' | 'airport'; code: string; title: string; sub: string; child?: boolean; value: string }

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Cities with several airports, by their IATA metropolitan code (the data's own city names are too uneven to group on:
// "Ferno (VA)" is Milan Malpensa, "Narita" is Tokyo). Searching the city or its code lists the city first, then its airports.
const METROS: [code: string, city: string, country: string, airports: string[], aliases?: string[]][] = [
  ['LON', 'London', 'United Kingdom', ['LHR', 'LGW', 'STN', 'LCY', 'LTN', 'SEN']],
  ['NYC', 'New York', 'United States', ['JFK', 'EWR', 'LGA']],
  ['PAR', 'Paris', 'France', ['CDG', 'ORY', 'BVA']],
  ['MIL', 'Milan', 'Italy', ['MXP', 'LIN', 'BGY'], ['milano']],
  ['ROM', 'Rome', 'Italy', ['FCO', 'CIA'], ['roma']],
  ['TYO', 'Tokyo', 'Japan', ['HND', 'NRT']],
  ['OSA', 'Osaka', 'Japan', ['KIX', 'ITM']],
  ['SEL', 'Seoul', 'South Korea', ['ICN', 'GMP']],
  ['BJS', 'Beijing', 'China', ['PEK', 'PKX']],
  ['SHA', 'Shanghai', 'China', ['PVG', 'SHA']],
  ['CHI', 'Chicago', 'United States', ['ORD', 'MDW']],
  ['WAS', 'Washington', 'United States', ['IAD', 'DCA', 'BWI']],
  ['HOU', 'Houston', 'United States', ['IAH', 'HOU']],
  ['DFW', 'Dallas', 'United States', ['DFW', 'DAL']],
  ['ORL', 'Orlando', 'United States', ['MCO', 'SFB']],
  ['YTO', 'Toronto', 'Canada', ['YYZ', 'YTZ']],
  ['MOW', 'Moscow', 'Russia', ['SVO', 'DME', 'VKO']],
  ['STO', 'Stockholm', 'Sweden', ['ARN', 'BMA']],
  ['IST', 'Istanbul', 'Turkey', ['IST', 'SAW']],
  ['DXB', 'Dubai', 'United Arab Emirates', ['DXB', 'DWC']],
  ['BKK', 'Bangkok', 'Thailand', ['BKK', 'DMK']],
  ['JKT', 'Jakarta', 'Indonesia', ['CGK', 'HLP']],
  ['BUE', 'Buenos Aires', 'Argentina', ['EZE', 'AEP']],
  ['RIO', 'Rio de Janeiro', 'Brazil', ['GIG', 'SDU']],
  ['SAO', 'São Paulo', 'Brazil', ['GRU', 'CGH', 'VCP']],
  ['TCI', 'Tenerife', 'Spain', ['TFS', 'TFN']],
  ['REK', 'Reykjavik', 'Iceland', ['KEF', 'RKV']],
];

let data: Promise<Map<string, Entry>> | null = null;
const load = () =>
  (data ??= fetch('/data/airports.json')
    .then((r) => r.json() as Promise<Row[]>)
    .then((rows) => new Map(rows.map((row) => {
      const name = fold(row[2]);
      return [row[0], { row, code: row[0].toLowerCase(), city: fold(row[1]), name, words: name.split(/[\s\-/().]+/).filter(Boolean), country: fold(row[3]) }];
    })))
    .catch(() => { data = null; return new Map(); }));

function scoreAirport(e: Entry, t: string) {
  if (e.code === t) return 100;
  if (e.city.startsWith(t)) return 60;
  if (e.name.startsWith(t)) return 55;
  if (e.words.some((w) => w.startsWith(t))) return 40;
  if (t.length >= 3 && e.code.startsWith(t)) return 35;
  if (e.country.startsWith(t)) return 15;
  if (t.length >= 4 && (e.name.includes(t) || e.city.includes(t))) return 10;
  return 0;
}
function scoreMetro([code, city, , , aliases = []]: (typeof METROS)[number], t: string) {
  if (code.toLowerCase() === t) return 101;   // just above an airport with the same code (IST, DXB...)
  const names = [fold(city), ...aliases];
  if (names.some((n) => n.startsWith(t))) return 70;   // a big city outranks a lone airport whose town matches
  if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(t)))) return 50;
  return 0;
}

const cityOf = (r: Row) => r[1].split(/[(,]/)[0].trim();
const airportItem = (r: Row, child = false): Item =>
  ({ kind: 'airport', code: r[0], title: r[2], sub: child ? r[3] : `${cityOf(r)}, ${r[3]}`, child, value: `${r[2].replace(/\s+(International\s+)?Airport$/i, '')} (${r[0]})` });

function search(all: Map<string, Entry>, q: string, max = 9): Item[] {
  const t = fold(q.trim());
  if (t.length < 2) return [];
  // each result is a block: a city with its airports, or a single airport; blocks are ranked by their best score
  const blocks: { score: number; items: Item[] }[] = [];
  const used = new Set<string>();
  for (const m of METROS) {
    const s = scoreMetro(m, t);
    if (!s) continue;
    const members = m[3].map((c) => all.get(c)).filter((e): e is Entry => !!e);
    if (!members.length) continue;
    members.forEach((e) => used.add(e.row[0]));
    blocks.push({ score: s, items: [
      { kind: 'city', code: m[0], title: m[1], sub: m[2], value: `${m[1]}, all airports (${m[0]})` },
      ...members.map((e) => airportItem(e.row, true)),
    ] });
  }
  for (const e of all.values()) {
    if (used.has(e.row[0])) continue;
    const s = scoreAirport(e, t);
    if (s) blocks.push({ score: s + e.row[4] * 8, items: [airportItem(e.row)] });
  }
  blocks.sort((a, b) => b.score - a.score);
  const out: Item[] = [];
  for (const b of blocks) { if (out.length >= max) break; out.push(...b.items.slice(0, max - out.length)); }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ICON = {
  city: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 10v7h3v-7H4Zm6 0v7h3v-7h-3ZM2 22h19v-3H2v3Zm14-12v7h3v-7h-3Zm-4.5-9L2 6v2h19V6l-9.5-5Z"/></svg>',
  airport: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"/></svg>',
  chev: '<svg viewBox="0 0 8 12" width="7" height="11" aria-hidden="true"><path d="M1.5 1 6.5 6l-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

let uid = 0;
export function initAirportSuggest(root: HTMLElement) {
  const list = document.createElement('ul');
  list.className = 'ap-list';
  list.id = `ap-list-${++uid}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  const popover = 'popover' in HTMLElement.prototype;
  if (popover) list.setAttribute('popover', 'manual');
  // On the page the list is absolutely positioned in page coordinates, so it scrolls with the page natively (a fixed
  // list re-placed on scroll lagged and jumped around on iOS). Inside the booking dialog it stays fixed.
  const inDialog = !!root.closest('dialog');
  if (!inDialog) list.classList.add('ap-list--page');
  (root.closest('dialog') ?? document.body).append(list);

  let input: HTMLInputElement | null = null;
  let rows: Item[] = [];
  let active = -1;
  let seq = 0;

  const place = () => {
    if (!input) return;
    const field = input.closest<HTMLElement>('.qf__row, .qf__mrow') ?? input;
    const r = field.getBoundingClientRect();
    const dx = inDialog ? 0 : scrollX, dy = inDialog ? 0 : scrollY;
    Object.assign(list.style, { left: `${r.left + dx}px`, top: `${r.bottom + 4 + dy}px`, width: `${r.width}px` });
  };
  const show = (on: boolean) => {
    list.hidden = !on;
    if (popover) { try { on ? list.showPopover() : list.hidePopover(); } catch { /* already in that state */ } }
    input?.setAttribute('aria-expanded', String(on));
    if (on) place();
  };
  const paint = () => {
    list.innerHTML = rows.map((r, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}" class="ap-row ap-row--${r.kind}${r.child ? ' ap-row--child' : ''}">
      ${r.child ? '<span class="ap-branch" aria-hidden="true">↳</span>' : ''}<span class="ap-ic">${ICON[r.kind]}</span><span class="ap-txt"><span class="ap-name">${esc(r.title)}</span><span class="ap-sub">${esc(r.sub)}</span></span><span class="ap-code">${r.code}</span>${ICON.chev}</li>`).join('');
    if (active >= 0) input?.setAttribute('aria-activedescendant', `${list.id}-${active}`); else input?.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i: number) => {
    const r = rows[i];
    if (!r || !input) return;
    input.value = r.value;
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
  if (inDialog) addEventListener('scroll', place, true);
}
