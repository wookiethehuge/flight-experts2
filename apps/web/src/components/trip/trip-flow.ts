/**
 * Trip checkout behaviour (TripFlow.astro). Vanilla, one instance per [data-trip].
 *   - steps: itinerary -> passengers -> protection -> payment -> done; tabs go back to any reached step
 *   - each step's confirm switch must be on and its fields valid before Next Step
 *   - option radio cards swap the flight details and the summary; protection plan + tip feed the totals
 *   - choosing no protection (or none at all) asks first (dialog, Figma Addition 5)
 * PHASE 1 DEMO: nothing leaves the page.
 */
type Option = { id: string; price: number; cabin: string; bags: number; from: string; to: string; when: string; time: string };
type Plan = { id: string; name: string; price: number; popular?: boolean };
const STEPS = ['itinerary', 'passengers', 'protection', 'payment', 'done'] as const;
type Step = (typeof STEPS)[number];

export function initTripFlow() {
  document.querySelectorAll<HTMLElement>('[data-trip]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    init(root);
  });
}

function init(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(s: string, scope: ParentNode = root) => scope.querySelector<T>(s)!;
  const qa = <T extends Element = HTMLElement>(s: string, scope: ParentNode = root) => [...scope.querySelectorAll<T>(s)];
  const currency = root.dataset.currency || 'USD';
  const payers = Number(root.dataset.pax || 1);
  const options: Option[] = JSON.parse(root.dataset.options || '[]');
  const plans: Plan[] = JSON.parse(root.dataset.plans || '[]');
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  const live = q('[data-live]');
  const say = (m: string) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = m; }); };

  let step: Step = 'itinerary';
  let reached = 0;
  let optionId = options[0]?.id;
  let plan: string | null = null;           // plan id, 'none', or not chosen yet
  let tip: { pct?: number; amount?: number } = {};
  const confirmed: Partial<Record<Step, boolean>> = {};

  // ------------------------------------------------------------------ totals + summary
  const option = () => options.find((o) => o.id === optionId) ?? options[0];
  const base = () => option().price * payers;
  const protPrice = () => plans.find((p) => p.id === plan)?.price ?? 0;
  const tipAmount = () => Math.round((tip.amount ?? (tip.pct ? (base() * tip.pct) / 100 : 0)) * 100) / 100;
  function paintSummary() {
    const o = option();
    const set = (k: string, v: string) => qa(`[data-sum="${k}"]`).forEach((el) => { el.textContent = v; });
    set('from', o.from); set('to', o.to); set('when', o.when); set('time', o.time); set('cabin', o.cabin); set('bags', String(o.bags));
    const extras = protPrice() + tipAmount();
    set('prot', fmt(protPrice())); set('tip', fmt(tipAmount())); set('extras', fmt(extras));
    const total = fmt(base() + extras);
    set('total', total); set('total2', total);
    q('[data-tip-amt]').textContent = fmt(tipAmount());
    q('[data-sum-extra]').hidden = !(step === 'payment' || step === 'done');
  }

  // ------------------------------------------------------------------ steps
  const tabs = qa<HTMLButtonElement>('[data-tab]');
  const confirmBox = q<HTMLInputElement>('[data-confirm]');
  const confirmErr = q('[data-confirm-err]');
  const nextBtn = q<HTMLButtonElement>('[data-next]');
  function show(s: Step, focus = true) {
    step = s;
    root.dataset.at = s;   // CSS hooks per step (agent photo hidden on payment)
    root.querySelector<HTMLElement>('[data-errsum]')?.toggleAttribute('hidden', true);   // the error summary belongs to the step it was made for
    const i = STEPS.indexOf(s);
    reached = Math.max(reached, i);
    qa('[data-step]').forEach((el) => { el.hidden = el.dataset.step !== s; });
    qa('[data-side]').forEach((el) => { el.hidden = el.dataset.side !== s; });
    qa('[data-confirm-label]').forEach((el) => { el.hidden = el.dataset.confirmLabel !== s; });
    q('.trip__confirm').hidden = s === 'done';
    nextBtn.hidden = s === 'done';
    nextBtn.textContent = s === 'payment' ? 'Complete Booking' : 'Next Step';
    confirmBox.checked = !!confirmed[s];
    confirmErr.hidden = true;
    tabs.forEach((t, ti) => {
      const cur = ti === Math.min(i, 3);
      if (cur) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
      t.disabled = s === 'done' || ti > reached;
    });
    paintSummary();
    if (focus) {
      const sec = q(`[data-step="${s}"]`);
      const top = q('.trip__body').getBoundingClientRect().top + scrollY - 16;
      if (scrollY > top) scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      (sec.querySelector<HTMLElement>('h2') ?? sec).setAttribute('tabindex', '-1');
      (sec.querySelector<HTMLElement>('h2') ?? sec).focus({ preventScroll: true });
    }
    say(s === 'done' ? 'Booking request complete.' : `Step ${i + 1} of 4: ${tabs[i].textContent}.`);
  }
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab as Step)));
  qa('[data-back]').forEach((b) => b.addEventListener('click', () => show(STEPS[Math.max(0, STEPS.indexOf(step) - 1)])));
  confirmBox.addEventListener('change', () => { confirmed[step] = confirmBox.checked; if (confirmBox.checked) confirmErr.hidden = true; });

  // ------------------------------------------------------------------ 1. options (radio cards, roving tabindex)
  const opts = qa<HTMLButtonElement>('[data-option]');
  function pick(id: string, focus = false) {
    optionId = id;
    opts.forEach((b) => { const on = b.dataset.option === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    qa('[data-details]').forEach((d) => { d.hidden = d.dataset.details !== id; });
    paintSummary();
  }
  opts.forEach((b, i) => {
    b.addEventListener('click', () => pick(b.dataset.option!));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); pick(opts[(i + d + opts.length) % opts.length].dataset.option!, true); }
      else if (e.key === 'Home') { e.preventDefault(); pick(opts[0].dataset.option!, true); }
      else if (e.key === 'End') { e.preventDefault(); pick(opts[opts.length - 1].dataset.option!, true); }
    });
  });

  // ------------------------------------------------------------------ dropdowns (TripSelect)
  qa('[data-tsel]').forEach(initSelect);
  // date-of-birth month: the dropdown writes into the hidden input the check reads (and re-checks it once it shows an error)
  qa<HTMLElement>('[data-tsel][data-f="dob-m-pick"]').forEach((pick) => {
    const input = pick.parentElement!.querySelector<HTMLInputElement>('input[data-f="dob-m"]')!;
    pick.addEventListener('tsel:change', () => {
      input.value = pick.dataset.value ?? '';
      input.dataset.text = pick.querySelector('[data-tsel-val]')!.textContent ?? '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // ------------------------------------------------------------------ input masks
  const digits = (v: string) => v.replace(/\D/g, '');
  const mask = (f: string, fn: (v: string) => string) => qa<HTMLInputElement>(`input[data-f="${f}"]`).forEach((el) =>
    el.addEventListener('input', () => { const v = fn(el.value); if (v !== el.value) el.value = v; }));
  mask('dob-d', (v) => digits(v).slice(0, 2));
  mask('dob-y', (v) => digits(v).slice(0, 4));
  mask('card', (v) => digits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '));
  mask('exp', (v) => { const d = digits(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; });
  mask('cvv', (v) => digits(v).slice(0, 4));

  // ------------------------------------------------------------------ city: search the chosen country's towns
  initCity(root);

  // ------------------------------------------------------------------ validation
  type Field = HTMLInputElement | HTMLSelectElement;
  const FIELDS = 'input[data-f], select[data-f]';
  const today = new Date();
  // date of birth: three fields, one message for the group; returns the message and which parts are at fault
  function dobCheck(group: Element): { msg: string; bad: Field[] } {
    const [m, d, y] = ['m', 'd', 'y'].map((k) => group.querySelector<Field>(`[data-f="dob-${k}"]`)!);
    const mo = Number(m.value), day = Number(d.value), yr = Number(y.value);
    const missing: [Field, string][] = [];
    if (!mo) missing.push([m, 'month']);
    if (!(day >= 1 && day <= 31)) missing.push([d, 'day']);
    if (!(y.value.length === 4 && yr >= 1900 && yr <= today.getFullYear())) missing.push([y, 'year']);
    if (missing.length) {
      const names = missing.map(([, n]) => n);
      return { msg: `Enter the ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} of birth.`, bad: missing.map(([f]) => f) };
    }
    const date = new Date(yr, mo - 1, day);
    if (date.getMonth() !== mo - 1) return { msg: `${m.dataset.text ?? ''} ${yr} has no day ${day}.`, bad: [d] };
    if (date > today) return { msg: 'The date of birth can’t be in the future.', bad: [m, d, y] };
    return { msg: '', bad: [] };
  }
  const luhn = (n: string) => { let s = 0; for (let i = 0; i < n.length; i++) { let x = Number(n[n.length - 1 - i]); if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } return s % 10 === 0; };
  function message(el: Field): string {
    const v = el.value.trim();
    switch (el.dataset.f) {
      case 'first': return v ? '' : 'Enter the first name as in the passport.';
      case 'last': return v ? '' : 'Enter the last name as in the passport.';
      case 'card': { const n = digits(v); return n.length >= 13 && n.length <= 19 && luhn(n) ? '' : 'Enter a valid card number.'; }
      case 'holder': return v ? '' : 'Enter the name on the card.';
      case 'exp': {
        const m = /^(\d{2})\/(\d{2})$/.exec(v);
        if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return 'Enter the expiry date as MM/YY.';
        const end = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59);
        return end < today ? 'This card has expired.' : '';
      }
      case 'cvv': return /^\d{3,4}$/.test(v) ? '' : 'Enter the 3 or 4 digit security code.';
      case 'city': return v ? '' : 'Enter the city.';
      case 'state': return v ? '' : 'Enter the state or region.';
      case 'street': return v ? '' : 'Enter the street address.';
      case 'zip': return v ? '' : 'Enter the ZIP or postal code.';
      case 'phone': { const n = digits(v); return n.length >= 6 && n.length <= 14 ? '' : 'Enter a valid phone number.'; }
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v) ? '' : 'Enter a valid email address.';
      default: return '';
    }
  }
  const errOf = (el: HTMLElement) => (el.closest('[data-dob]') ?? el.closest('.trip__field'))?.querySelector<HTMLElement>('.trip__err') ?? null;
  function check(el: Field) {
    const group = el.closest('[data-dob]');
    if (group) {
      const { msg, bad } = dobCheck(group);
      const err = errOf(el)!;
      err.id ||= `dob-err-${Math.random().toString(36).slice(2, 7)}`;
      group.querySelectorAll<Field>(FIELDS).forEach((f) => {
        if (bad.includes(f)) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
        f.setAttribute('aria-describedby', err.id);
      });
      err.textContent = msg; err.hidden = !msg;
      return !bad.includes(el);
    }
    const m = message(el);
    const err = errOf(el);
    if (m) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (err) {
      err.id ||= `${el.dataset.f}-err-${Math.random().toString(36).slice(2, 7)}`;
      el.setAttribute('aria-describedby', err.id);
      err.textContent = m; err.hidden = !m;
    }
    return !m;
  }
  // re-check while fixing; a date-of-birth part re-checks whenever its group shows an error (changing the month can fix the day)
  const showing = (el: Field) => el.getAttribute('aria-invalid') || (el.closest('[data-dob]') && errOf(el)?.hidden === false);
  root.addEventListener('input', (e) => { const el = e.target as Field; if (el.matches(FIELDS) && showing(el)) { check(el); summary(); } });
  root.addEventListener('focusout', (e) => { const el = e.target as Field; if (el.matches(FIELDS) && el.closest('[data-step]')?.hasAttribute('data-tried')) { check(el); summary(); } });
  // error summary by the Next button: one line per problem on the current step ("Card Number: Enter a valid card
  // number."), each one focusing its field; it updates as fields are fixed and goes away when none are left
  const sumBox = q('[data-errsum]');
  const sumList = q('[data-errsum-list]');
  let sumRows: { text: string; el: Field }[] = []; let sumKey = '';
  const focusField = (el: Field) => (el.type === 'hidden' ? el.closest('.trip__field')?.querySelector<HTMLElement>('button') : el)?.focus();
  function summary() {
    const sec = q(`[data-step="${step}"]`);
    if (!sec.hasAttribute('data-tried')) { sumBox.hidden = true; return; }
    const many = qa('[data-pax-panel]', sec).length > 1;
    const seen = new Set<HTMLElement>();
    const rows: { text: string; el: Field }[] = [];
    qa<Field>(FIELDS, sec).filter((el) => el.getAttribute('aria-invalid') === 'true').forEach((el) => {
      const err = errOf(el);
      if (!err || err.hidden || seen.has(err)) return;
      seen.add(err);
      const group = el.closest('[data-dob]');
      const raw = group ? 'Date of birth' : el.closest('.trip__field, .trip__phone-in')?.querySelector(':scope > span')?.textContent ?? '';
      const label = raw.replace(/\s*\*.*$/, '').trim();
      const who = many ? `${el.closest('[data-pax-panel]')?.querySelector('legend')?.textContent?.trim()}, ` : '';
      rows.push({ text: `${who}${label}: ${err.textContent}`, el });
    });
    sumRows = rows;
    // rebuilt only when the wording changes: leaving a field re-checks it as a summary line is clicked, and a rebuilt
    // list would swallow that click
    const key = rows.map((r) => r.text).join('\n');
    if (key !== sumKey) {
      sumKey = key;
      sumList.replaceChildren(...rows.map(({ text }, i) => {
        const li = document.createElement('li'); const b = document.createElement('button');
        b.type = 'button'; b.textContent = text; b.addEventListener('click', () => focusField(sumRows[i].el));
        li.append(b); return li;
      }));
    }
    sumBox.hidden = !rows.length;
  }
  function validStep(s: Step) {
    const sec = q(`[data-step="${s}"]`);
    sec.setAttribute('data-tried', '');
    const bad = qa<Field>(FIELDS, sec).filter((el) => !check(el));
    // a hidden input (the month) is focused through its dropdown button
    summary();
    if (bad.length) { focusField(bad[0]); say(`Please check ${bad.length === 1 ? '1 field' : `${bad.length} fields`}.`); return false; }
    return true;
  }

  // ------------------------------------------------------------------ 3. protection
  const picks = qa<HTMLButtonElement>('[data-plan]');
  function choosePlan(id: string) {
    plan = id;
    picks.forEach((b) => {
      const on = b.dataset.plan === id;
      b.setAttribute('aria-pressed', String(on));
      const l = b.querySelector('[data-pick-label]'); if (l) l.textContent = on ? 'Selected' : 'Select';
    });
    qa('[data-prot] [data-col]').forEach((c) => c.classList.toggle('is-col', c.dataset.col === id));
    paintSummary();
  }
  const modal = q<HTMLDialogElement>('[data-noprot]');
  let skipThenNext = false;                 // opened from Next Step: skipping also advances
  function askNoProt(fromNext: boolean) { skipThenNext = fromNext; modal.showModal(); }
  // "No protection" asks first; the choice only lands on "Continue Without Protection"
  picks.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.plan === 'none') { if (plan !== 'none') askNoProt(false); return; }
    choosePlan(b.dataset.plan!);
  }));
  q('[data-modal-close]', modal).addEventListener('click', () => modal.close());
  q('[data-modal-add]', modal).addEventListener('click', () => {
    modal.close();
    const pop = plans.find((p) => p.id === 'basic') ?? plans[0];   // the dialog offers Basic Protection (client copy)
    if (pop) { choosePlan(pop.id); picks.find((b) => b.dataset.plan === pop.id)?.focus(); }
  });
  q('[data-modal-skip]', modal).addEventListener('click', () => {
    modal.close(); choosePlan('none');
    if (skipThenNext) show('payment');
    else picks.find((b) => b.dataset.plan === 'none')?.focus();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // ------------------------------------------------------------------ 4. tip
  const chips = qa<HTMLButtonElement>('[data-tip]');
  const customWrap = q('[data-tip-custom]');
  const customIn = q<HTMLInputElement>('input', customWrap);
  chips.forEach((c) => c.addEventListener('click', () => {
    const on = c.getAttribute('aria-pressed') !== 'true';
    chips.forEach((x) => x.setAttribute('aria-pressed', String(on && x === c)));
    customWrap.hidden = !(on && c.dataset.tip === 'custom');
    tip = !on ? {} : c.dataset.tip === 'custom' ? { amount: Number(customIn.value.replace(/[^\d.]/g, '')) || 0 } : { pct: Number(c.dataset.tip) };
    if (!customWrap.hidden) customIn.focus();
    paintSummary();
  }));
  customIn.addEventListener('input', () => { tip = { amount: Math.min(Number(customIn.value.replace(/[^\d.]/g, '')) || 0, 100000) }; paintSummary(); });

  // ------------------------------------------------------------------ next
  nextBtn.addEventListener('click', () => {
    if (step === 'passengers' && !validStep('passengers')) return;
    if (step === 'payment' && !validStep('payment')) return;
    if (!confirmBox.checked) { confirmErr.hidden = false; confirmBox.focus(); say('Please confirm to continue.'); return; }
    if (step === 'protection' && plan === null) { askNoProt(true); return; }   // 'none' was already confirmed
    show(STEPS[STEPS.indexOf(step) + 1]);
  });

  show('itinerary', false);
}

// ------------------------------------------------------------------ dropdown (button + listbox)
function initSelect(wrap: HTMLElement) {
  const btn = wrap.querySelector<HTMLButtonElement>('.tsel__btn')!;
  const list = wrap.querySelector<HTMLElement>('[role="listbox"]')!;
  const val = wrap.querySelector<HTMLElement>('[data-tsel-val]')!;
  const items = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  let active = 0;
  let typed = ''; let typedAt = 0;
  const setActive = (i: number) => {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, j) => li.classList.toggle('is-active', j === active));
    list.setAttribute('aria-activedescendant', items[active].id);
    // keep the active option visible by scrolling the list only (scrollIntoView also scrolled the page, and the
    // footer plane, which moves with the page, looked like it jumped)
    const li = items[active];
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
  };
  const choose = (i: number) => {
    items.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    const changed = wrap.dataset.value !== items[i].dataset.value;
    wrap.dataset.value = items[i].dataset.value;
    val.textContent = items[i].textContent;
    if (changed) wrap.dispatchEvent(new CustomEvent('tsel:change', { bubbles: true, detail: { value: wrap.dataset.value } }));
  };
  const onOutside = (e: Event) => { if (!wrap.contains(e.target as Node)) close(false); };
  function open() {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, items.findIndex((li) => li.getAttribute('aria-selected') === 'true')));
    list.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onOutside);
  }
  function close(refocus = true) {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside);
    if (refocus) btn.focus();
  }
  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (li) { choose(items.indexOf(li)); close(); }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); close(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) {
      const now = Date.now(); typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = now;
      const i = items.findIndex((li) => li.textContent!.toLowerCase().startsWith(typed));
      if (i >= 0) setActive(i);
    }
  });
}

// ------------------------------------------------------------------ city combobox (payment step)
// Suggestions from /data/cities/<country>.json (GeoNames, places over 1,000 people, largest first; [name, region]),
// loaded when needed. Any town can still be typed. Picking a city fills State when it is empty, for countries whose
// first-level regions are states / provinces.
const STATE_COUNTRIES = new Set(['US', 'CA', 'AU', 'MX', 'BR', 'IN', 'AR', 'MY', 'NG', 'ZA']);
const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function initCity(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>('[data-city]');
  const country = root.querySelector<HTMLElement>('[data-tsel][data-f="country"]');
  if (!box || !country) return;
  const input = box.querySelector<HTMLInputElement>('input')!;
  const list = box.querySelector<HTMLElement>('[data-city-list]')!;
  const state = root.querySelector<HTMLInputElement>('input[data-f="state"]');
  const cache = new Map<string, Promise<string[][]>>();
  const load = (cc: string) => {
    if (!cache.has(cc)) cache.set(cc, fetch(`/data/cities/${cc}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
    return cache.get(cc)!;
  };
  let rows: string[][] = [];
  let shown: string[][] = [];
  let active = -1;
  const cc = () => country.dataset.value || 'US';
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = (i: number) => {
    const lis = [...list.children] as HTMLElement[];
    active = lis.length ? (i + lis.length) % lis.length : -1;
    lis.forEach((li, j) => li.classList.toggle('is-active', j === active));
    if (active >= 0) {
      const li = lis[active];
      input.setAttribute('aria-activedescendant', li.id);
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }
  };
  async function suggest() {
    rows = await load(cc());
    const q = fold(input.value);
    if (!q) { close(); return; }
    const starts: string[][] = [], has: string[][] = [];
    for (const r of rows) {
      const n = fold(r[0]);
      if (n.startsWith(q)) starts.push(r); else if (q.length >= 3 && n.includes(q)) has.push(r);   // "contains" from 3 letters
      if (starts.length >= 8) break;
    }
    shown = [...starts, ...has].slice(0, 8);
    list.replaceChildren(...shown.map((r, i) => {
      const li = document.createElement('li');
      li.id = `trip-city-${i}`; li.setAttribute('role', 'option');
      li.append(r[0]);
      if (r[1] && r[1] !== r[0]) { const sm = document.createElement('small'); sm.textContent = r[1]; li.append(sm); }
      return li;
    }));
    list.hidden = !shown.length;
    input.setAttribute('aria-expanded', String(!!shown.length));
    active = -1;
  }
  function pick(i: number) {
    const r = shown[i]; if (!r) return;
    input.value = r[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (state && !state.value.trim() && r[1] && STATE_COUNTRIES.has(cc())) { state.value = r[1]; state.dispatchEvent(new Event('input', { bubbles: true })); }
    close();
  }
  input.addEventListener('focus', () => { load(cc()); });
  input.addEventListener('input', (e) => { if (e.isTrusted) suggest(); });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) { if (e.key === 'ArrowDown' && input.value) { e.preventDefault(); suggest(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault());   // keep focus in the input
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li) pick([...list.children].indexOf(li));
  });
  input.addEventListener('blur', close);
  country.addEventListener('tsel:change', () => { close(); load(cc()); });
}
