/**
 * Behaviour for DatePicker.astro: a modal <dialog> with a scrolling list of months rendered as ARIA grids.
 * Dates are local calendar days handled as ISO strings (yyyy-mm-dd).
 * Like Kayak / Expedia there is no confirm button: picking the return date (round trip) or the date (one way) applies
 * and closes the dialog after a short beat, so the choice is seen. Closing early (X, Escape, outside click) keeps
 * whatever was already picked.
 */

export const MONTHS_AHEAD = 12;
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayIso = () => toIso(new Date());
const addDays = (iso: string, n: number) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const addMonths = (iso: string, n: number) => {
  const d = fromIso(iso); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
};
/** "Thu, Sept 24" (the design's display format) */
export const fmtShort = (iso: string) => { const d = fromIso(iso); return `${DOW_SHORT[d.getDay()]}, ${MON_SHORT[d.getMonth()]} ${d.getDate()}`; };
/** "Thursday, September 24, 2026" (for screen readers) */
export const fmtLong = (iso: string) => fromIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Pin a modal <dialog> next to its trigger from 48rem up (left edge = anchor's left for 'start', right edge = anchor's
 * right for 'end', 3px below it, kept inside the viewport). Below 48rem the inline styles are cleared and CSS centres it.
 */
export function placeDialog(dialog: HTMLDialogElement, anchor: HTMLElement, align: 'start' | 'end') {
  const s = dialog.style;
  if (!matchMedia('(min-width: 48rem)').matches) {
    for (const k of ['margin', 'left', 'top', 'right', 'bottom']) s.removeProperty(k);
    return;
  }
  const r = anchor.getBoundingClientRect();
  const w = dialog.offsetWidth; const h = dialog.offsetHeight;
  const x = align === 'end' ? r.right - w : r.left;
  s.margin = '0'; s.right = 'auto'; s.bottom = 'auto';
  s.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  s.top = `${Math.max(8, Math.min(r.bottom + 3, innerHeight - h - 8))}px`;
}

export interface PickerOptions {
  mode: 'range' | 'single';
  /** which date the next click sets (range mode) */
  phase: 'depart' | 'return';
  depart?: string;
  ret?: string;
  /** earliest selectable day (ISO) */
  min: string;
  anchor: HTMLElement;
  title: string;
  onApply: (depart: string | undefined, ret: string | undefined) => void;
}

export function createDatePicker(dialog: HTMLDialogElement) {
  const months = dialog.querySelector<HTMLElement>('[data-dp-months]')!;
  const live = dialog.querySelector<HTMLElement>('[data-dp-live]')!;
  const depOut = dialog.querySelector<HTMLElement>('[data-dp-dep]')!;
  const retOut = dialog.querySelector<HTMLElement>('[data-dp-ret]')!;
  let autoClose = 0;
  const title = dialog.querySelector<HTMLElement>('[data-dp-title]')!;
  const cols = dialog.querySelectorAll<HTMLElement>('.dp__col');
  let opts: PickerOptions | null = null;
  let dep: string | undefined; let ret: string | undefined; let phase: 'depart' | 'return' = 'depart';
  let built = ''; // month the grid was built from
  let first = ''; let last = '';
  let cells: HTMLElement[] = [];
  let returnFocus: HTMLElement | null = null;

  function build() {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    if (built === key) return;
    built = key;
    const dow: [string, string][] = JSON.parse(months.dataset.dow || '[]');
    const uid = dialog.id;
    let html = '';
    for (let m = 0; m < MONTHS_AHEAD; m++) {
      const start = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const tid = `${uid}-m${m}`;
      html += `<section class="dp__month"><h3 class="dp__mtitle" id="${tid}">${label}</h3><table role="grid" aria-labelledby="${tid}"><thead class="sr-only"><tr>${dow.map(([s, l]) => `<th scope="col" abbr="${l}">${s}</th>`).join('')}</tr></thead><tbody><tr>`;
      let col = start.getDay();
      for (let i = 0; i < col; i++) html += '<td></td>';
      for (let d = 1; d <= days; d++) {
        const iso = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(d)}`;
        html += `<td data-date="${iso}" tabindex="-1" aria-selected="false"><span>${d}</span></td>`;
        col++;
        if (col === 7 && d < days) { html += '</tr><tr>'; col = 0; }
      }
      while (col > 0 && col < 7) { html += '<td></td>'; col++; }
      html += '</tr></tbody></table></section>';
    }
    months.innerHTML = html;
    cells = [...months.querySelectorAll<HTMLElement>('td[data-date]')];
    first = cells[0].dataset.date!;
    last = cells[cells.length - 1].dataset.date!;
  }

  const cell = (iso: string) => months.querySelector<HTMLElement>(`td[data-date="${iso}"]`);

  function paint() {
    if (!opts) return;
    const today = todayIso();
    for (const c of cells) {
      const iso = c.dataset.date!;
      const isStart = iso === dep;
      const isEnd = opts.mode === 'range' && !!ret && iso === ret;
      c.classList.toggle('is-today', iso === today);
      c.classList.toggle('is-start', isStart);
      c.classList.toggle('has-end', isStart && !!ret && ret !== dep && opts.mode === 'range');
      c.classList.toggle('is-end', isEnd && ret !== dep);
      const inRange = opts.mode === 'range' && !!dep && !!ret && iso > dep && iso < ret;
      c.classList.toggle('in-range', inRange);
      // round the band where a row (or month) starts / ends
      const edgeL = !(c.previousElementSibling as HTMLElement | null)?.dataset?.date;
      const edgeR = !(c.nextElementSibling as HTMLElement | null)?.dataset?.date;
      c.classList.toggle('band-l', inRange && edgeL);
      c.classList.toggle('band-r', inRange && edgeR);
      c.classList.toggle('no-band', (isStart && edgeR) || (isEnd && edgeL));
      c.setAttribute('aria-selected', String(isStart || isEnd));
      if (iso < opts.min) c.setAttribute('aria-disabled', 'true'); else c.removeAttribute('aria-disabled');
    }
    depOut.textContent = dep ? fmtShort(dep) : '–';
    retOut.textContent = ret ? fmtShort(ret) : '–';
    cols[0]?.classList.toggle('is-active', opts.mode === 'range' && phase === 'depart');
    cols[1]?.classList.toggle('is-active', opts.mode === 'range' && phase === 'return');
  }

  function focusDay(iso: string, scroll = true) {
    if (iso < first) iso = first;
    if (iso > last) iso = last;
    const c = cell(iso);
    if (!c) return;
    for (const x of cells) x.tabIndex = -1;
    c.tabIndex = 0;
    c.focus({ preventScroll: true });
    if (scroll) c.scrollIntoView({ block: 'nearest' });
  }

  function choose(iso: string) {
    if (!opts || iso < opts.min) return;
    let done = false;
    if (opts.mode === 'single') {
      dep = iso;
      done = true;
      live.textContent = `${fmtLong(iso)} selected.`;
    } else if (phase === 'depart' || !dep || iso < dep) {
      const keepRet = phase === 'depart' && !!ret && iso < ret;   // only the departure was being changed
      dep = iso;
      if (ret && ret < iso) ret = undefined;
      phase = 'return';
      if (keepRet) done = true;
      live.textContent = `Departure ${fmtLong(iso)}. ${ret ? '' : 'Now choose your return date.'}`;
    } else {
      ret = iso;
      done = true;
      live.textContent = `Return ${fmtLong(iso)}.`;
    }
    paint();
    clearTimeout(autoClose);
    if (done) autoClose = window.setTimeout(() => close(true, true), 320);
  }

  const place = () => { if (opts) placeDialog(dialog, opts.anchor, 'start'); };
  const onScroll = (e: Event) => { if (!(e.target instanceof Node) || !dialog.contains(e.target)) place(); };

  function close(commit: boolean, fade = false) {
    if (!opts) return;
    clearTimeout(autoClose);
    const o = opts;
    opts = null;
    removeEventListener('scroll', onScroll, true);
    removeEventListener('resize', onScroll);
    if (commit && dep) o.onApply(dep, o.mode === 'range' ? ret : undefined);   // the field updates under the fade
    const finish = () => { dialog.classList.remove('is-closing'); if (dialog.open) dialog.close(); returnFocus?.focus(); };
    if (fade && dialog.open && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.classList.add('is-closing');
      window.setTimeout(finish, 460);
    } else finish();
  }

  months.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-date]');
    if (!c || c.getAttribute('aria-disabled') === 'true') return;
    choose(c.dataset.date!);
    focusDay(c.dataset.date!, false);
  });
  months.addEventListener('keydown', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-date]');
    if (!c) return;
    const iso = c.dataset.date!;
    const dow = fromIso(iso).getDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(iso, -1), ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7), ArrowDown: () => addDays(iso, 7),
      PageUp: () => addMonths(iso, e.shiftKey ? -12 : -1), PageDown: () => addMonths(iso, e.shiftKey ? 12 : 1),
      Home: () => addDays(iso, -dow), End: () => addDays(iso, 6 - dow),
    };
    if (moves[e.key]) { e.preventDefault(); focusDay(moves[e.key]()); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (c.getAttribute('aria-disabled') === 'true') { live.textContent = 'That date has passed. Choose a later date.'; return; }
      choose(iso);
    }
  });
  dialog.querySelector('[data-dp-close]')!.addEventListener('click', () => close(true));
  // tapping Departure / Return in the summary picks which date the next day click sets, and jumps to it
  dialog.querySelectorAll<HTMLButtonElement>('[data-dp-phase]').forEach((b) => b.addEventListener('click', () => {
    if (!opts || opts.mode !== 'range') return;
    clearTimeout(autoClose);
    phase = b.dataset.dpPhase === 'return' && dep ? 'return' : 'depart';
    live.textContent = phase === 'return' ? 'Choose your return date.' : 'Choose your departure date.';
    paint();
    const target = phase === 'return' ? (ret ?? addDays(dep!, 1)) : (dep ?? todayIso());
    focusDay(target);
  }));
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(true); });
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(true);
  });

  return {
    open(o: PickerOptions) {
      build();
      opts = o;
      returnFocus = document.activeElement as HTMLElement | null;
      dep = o.depart && o.depart >= o.min ? o.depart : undefined;
      ret = o.mode === 'range' ? o.ret : undefined;
      if (ret && dep && ret < dep) ret = undefined;
      phase = o.mode === 'range' && o.phase === 'return' && dep ? 'return' : 'depart';
      dialog.classList.remove('is-closing');
      dialog.dataset.mode = o.mode;
      title.textContent = o.title;
      live.textContent = '';
      paint();
      if (dialog.open) dialog.close();   // reopened during the fade-out
      dialog.showModal();
      place();
      addEventListener('scroll', onScroll, true);
      addEventListener('resize', onScroll);
      const target = (phase === 'return' ? ret ?? (dep ? addDays(dep, 1) : undefined) : dep) ?? (o.min > todayIso() ? o.min : todayIso());
      months.scrollTop = 0;
      focusDay(target);
      const sec = cell(target)?.closest('section');
      if (sec) months.scrollTop = sec.offsetTop - months.offsetTop;
    },
    close: () => close(true),
  };
}
