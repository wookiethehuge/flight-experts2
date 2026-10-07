/**
 * QuoteForm behaviour: trip-type listbox, cabin & travellers dialog, date picker, multi-city legs, two-step
 * validation (trip -> contact, in place) and submission through submitEnquiry. Vanilla, one instance per
 * [data-quote-form] root (hero + booking modal can coexist on a page).
 */
import { submitEnquiry, startTimer, THANK_YOU_URL } from '../../scripts/enquiry';
import { createDatePicker, placeDialog, fmtShort, fmtLong, todayIso } from './datepicker';
import { turnstileFor } from '../../scripts/turnstile';

type Trip = 'round' | 'oneway' | 'multi';
type Pax = { adults: number; children: number; infants: number };

const TRIP_LABEL: Record<Trip, string> = { round: 'Round trip', oneway: 'One-Way', multi: 'Multi-City' };
const TRIP_API = { round: 'round-trip', oneway: 'one-way', multi: 'multi-city' } as const;
/** pill label (short so it fits the 223px pill) */
const CABIN_SHORT: Record<string, string> = { first: 'First', business: 'Business', 'premium-economy': 'Premium', economy: 'Economy' };
const MAX_LEGS = 5;
const MAX_PAX = 9;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const phoneOk = (v: string) => /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15;

export function initQuoteForms() {
  document.querySelectorAll<HTMLElement>('[data-quote-form]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    init(root);
  });
}

function init(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = root) => scope.querySelector<T>(sel)!;
  const uid = root.id;
  const form = q<HTMLFormElement>('form');
  const status = q('[data-status]');
  const alertEl = q('[data-alert]');
  const t0 = startTimer();

  let trip: Trip = 'round';
  let step: 'trip' | 'contact' = 'trip';
  let attempted = false;
  let busy = false;
  let pax: Pax = { adults: 1, children: 0, infants: 0 };
  let cabin = 'business';

  const say = (msg: string) => { status.textContent = ''; requestAnimationFrame(() => { status.textContent = msg; }); };
  const emit = (name: string, detail?: unknown) => root.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

  // ------------------------------------------------------------------ trip type listbox
  const tripBtn = q<HTMLButtonElement>('[data-trip-btn]');
  const tripVal = q('[data-trip-val]');
  const list = q('[data-trip-list]');
  const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const tripWrap = tripBtn.parentElement!;
  let active = 0;

  const setActive = (i: number) => {
    active = (i + options.length) % options.length;
    options.forEach((o, k) => o.classList.toggle('is-active', k === active));
    list.setAttribute('aria-activedescendant', options[active].id);
  };
  const onOutside = (e: Event) => { if (!tripWrap.contains(e.target as Node)) closeList(false); };
  function openList() {
    list.hidden = false;
    tripBtn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, options.findIndex((o) => o.getAttribute('aria-selected') === 'true')));
    list.focus();
    document.addEventListener('pointerdown', onOutside, true);
  }
  function closeList(refocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    tripBtn.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    options.forEach((o) => o.classList.remove('is-active'));
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) tripBtn.focus();
  }
  tripBtn.addEventListener('click', () => (list.hidden ? openList() : closeList()));
  tripBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
  });
  list.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowDown') setActive(active + 1);
    else if (k === 'ArrowUp') setActive(active - 1);
    else if (k === 'Home') setActive(0);
    else if (k === 'End') setActive(options.length - 1);
    else if (k === 'Enter' || k === ' ') { setTrip(options[active].dataset.value as Trip); closeList(); }
    else if (k === 'Escape') { e.stopPropagation(); closeList(); }
    else if (k === 'Tab') { closeList(false); return; }
    else if (k.length === 1) {
      const i = options.findIndex((o) => o.textContent!.trim().toLowerCase().startsWith(k.toLowerCase()));
      if (i >= 0) setActive(i);
      return;
    } else return;
    e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (o) { setTrip(o.dataset.value as Trip); closeList(); }
  });
  list.addEventListener('pointermove', (e) => {
    const i = options.indexOf((e.target as HTMLElement).closest<HTMLElement>('[role="option"]')!);
    if (i >= 0 && i !== active) setActive(i);
  });

  // ------------------------------------------------------------------ legs
  const leg1 = q('[data-leg]');
  const dep1 = q<HTMLButtonElement>('[data-date-btn="depart"]', leg1);
  const ret1 = q<HTMLButtonElement>('[data-date-btn="return"]', leg1);
  const legsWrap = q('[data-legs]');
  const legTpl = q<HTMLTemplateElement>('[data-leg-template]');
  const addBtn = q<HTMLButtonElement>('[data-add-leg]');
  const placeholderHtml = q('[data-date-val]', dep1).innerHTML;
  let legSeq = 0;
  const mlegs = () => [...legsWrap.children] as HTMLElement[];
  const field = <T extends HTMLElement = HTMLInputElement>(scope: ParentNode, name: string) => scope.querySelector<T>(`[data-field="${name}"]`)!;

  function renumber() {
    mlegs().forEach((leg, i) => {
      const n = i + 2;
      q('[data-mleg-title]', leg).textContent = `Flight ${n}`;
      field(leg, 'from').setAttribute('aria-label', `Flight ${n}, going from, airport or city`);
      field(leg, 'to').setAttribute('aria-label', `Flight ${n}, going to, airport or city`);
      const rm = q<HTMLButtonElement>('[data-remove-leg]', leg);
      rm.hidden = n === 2;
      rm.setAttribute('aria-label', `Remove flight ${n}`);
    });
    addBtn.hidden = mlegs().length + 1 >= MAX_LEGS;
  }
  function addLeg(focus: boolean) {
    if (mlegs().length + 1 >= MAX_LEGS) return;
    const leg = (legTpl.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement;
    const pre = `${uid}-leg${++legSeq}`;
    const title = q('[data-mleg-title]', leg);
    title.id = `${pre}-t`;
    leg.setAttribute('aria-labelledby', title.id);
    for (const name of ['from', 'to']) {
      const input = field(leg, name);
      const err = q(`[data-err="${name}"]`, leg);
      input.id = `${pre}-${name}`;
      err.id = `${pre}-${name}-err`;
      input.setAttribute('aria-describedby', err.id);
    }
    const btn = q<HTMLButtonElement>('[data-date-btn]', leg);
    const lbl = q('[data-lbl]', leg); const val = q('[data-date-val]', leg); const err = q('[data-err="depart"]', leg);
    lbl.id = `${pre}-dep-lbl`; val.id = `${pre}-dep-val`; err.id = `${pre}-dep-err`;
    btn.setAttribute('aria-labelledby', `${lbl.id} ${val.id}`);
    btn.setAttribute('aria-describedby', err.id);
    legsWrap.append(leg);
    renumber();
    if (focus) { field(leg, 'from').focus(); say(`Flight ${mlegs().length + 1} added.`); }
  }
  addBtn.addEventListener('click', () => addLeg(true));
  legsWrap.addEventListener('click', (e) => {
    const rm = (e.target as HTMLElement).closest('[data-remove-leg]');
    if (!rm) return;
    const leg = rm.closest<HTMLElement>('[data-mleg]')!;
    const n = mlegs().indexOf(leg) + 2;
    leg.remove();
    renumber();
    say(`Flight ${n} removed.`);
    (addBtn.hidden ? field(mlegs()[mlegs().length - 1] ?? leg1, 'from') : addBtn).focus();
  });

  const footBtn = q<HTMLButtonElement>('[data-foot-btn]');
  // multi-city keeps the panel at the round-trip height (the fields scroll inside), so switching never moves the page
  const panel = q<HTMLElement>('.qf__panel');
  function setTrip(t: Trip) {
    if (t === 'multi' && trip !== 'multi') root.style.setProperty('--qf-lock-h', `${panel.offsetHeight}px`);
    trip = t;
    root.dataset.trip = t;
    tripVal.textContent = TRIP_LABEL[t];
    options.forEach((o) => o.setAttribute('aria-selected', String(o.dataset.value === t)));
    if (t === 'multi' && !mlegs().length) addLeg(false);
    if (t !== 'round') setErr(ret1, null);
    if (attempted) validate(tripControls());
  }

  // ------------------------------------------------------------------ dates
  const picker = createDatePicker(q<HTMLDialogElement>('[data-datepicker]'));
  const dateOf = (b: HTMLElement) => b.dataset.value || undefined;
  function setDate(b: HTMLElement, iso?: string) {
    b.dataset.value = iso ?? '';
    b.classList.toggle('has-value', !!iso);
    // visible short date stays in the accessible name (label in name); the full date follows for screen readers
    q('[data-date-val]', b).innerHTML = iso ? `${fmtShort(iso)}<span class="sr-only"> (${fmtLong(iso)})</span>` : placeholderHtml;
    if (attempted || b.getAttribute('aria-invalid')) check(b);
  }
  const departBtns = () => [dep1, ...mlegs().map((l) => q<HTMLButtonElement>('[data-date-btn]', l))];
  function openPicker(btn: HTMLButtonElement) {
    const anchor = btn.closest<HTMLElement>('.qf__dates')!;
    if (trip === 'round' && (btn === dep1 || btn === ret1)) {
      picker.open({
        mode: 'range', phase: btn === ret1 ? 'return' : 'depart', depart: dateOf(dep1), ret: dateOf(ret1), min: todayIso(), anchor,
        title: 'Choose your departure and return dates',
        onApply: (d, r) => { setDate(dep1, d); setDate(ret1, r); },
      });
      return;
    }
    const all = departBtns();
    const i = all.indexOf(btn);
    const prev = all.slice(0, i).map(dateOf).filter(Boolean).pop();
    const min = prev && prev > todayIso() ? prev : todayIso();
    picker.open({
      mode: 'single', phase: 'depart', depart: dateOf(btn), min, anchor,
      title: trip === 'multi' ? `Choose the departure date for flight ${i + 1}` : 'Choose your departure date',
      onApply: (d) => setDate(btn, d),
    });
  }
  form.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-date-btn]');
    if (b) openPicker(b);
  });

  // ------------------------------------------------------------------ cabin & travellers
  const tp = q<HTMLDialogElement>('[data-travellers]');
  const cabinBtn = q<HTMLButtonElement>('[data-cabin-btn]');
  const cabinVal = q('[data-cabin-val]');
  const tpLive = q('[data-tp-live]', tp);
  let draft: Pax = { ...pax };
  let tpCommitted = false;
  const total = (x: Pax) => x.adults + x.children + x.infants;
  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  function paintTp() {
    tp.querySelectorAll<HTMLElement>('[data-pax]').forEach((row) => {
      const k = row.dataset.pax as keyof Pax;
      q('[data-count]', row).textContent = String(draft[k]);
      const [minus, plus] = row.querySelectorAll<HTMLButtonElement>('[data-delta]');
      minus.disabled = draft[k] <= (k === 'adults' ? 1 : 0);
      plus.disabled = total(draft) >= MAX_PAX || (k === 'infants' && draft.infants >= draft.adults);
    });
  }
  function cabinLabel() {
    const n = total(pax);
    cabinVal.textContent = `${CABIN_SHORT[cabin] ?? cabin} / ${n} Traveler${n === 1 ? '' : 's'}`;
  }
  const placeTp = () => { if (tp.open) placeDialog(tp, cabinBtn, 'end'); };
  const onTpScroll = (e: Event) => { if (!(e.target instanceof Node) || !tp.contains(e.target)) placeTp(); };
  cabinBtn.addEventListener('click', () => {
    draft = { ...pax };
    tpCommitted = false;
    tp.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) => { r.checked = r.value === cabin; });
    paintTp();
    tp.showModal();
    placeTp();
    cabinBtn.setAttribute('aria-expanded', 'true');
    addEventListener('scroll', onTpScroll, true);
    addEventListener('resize', placeTp);
  });
  tp.addEventListener('click', (e) => {
    const stepBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-delta]');
    if (stepBtn) {
      const row = stepBtn.closest<HTMLElement>('[data-pax]')!;
      const k = row.dataset.pax as keyof Pax;
      draft[k] += Number(stepBtn.dataset.delta);
      if (draft.infants > draft.adults) draft.infants = draft.adults;
      paintTp();
      const label = { adults: ['adult', 'adults'], children: ['child', 'children'], infants: ['infant', 'infants'] }[k];
      tpLive.textContent = noun(draft[k], label[0], label[1]);
      if (stepBtn.disabled) (row.querySelector<HTMLButtonElement>('[data-delta]:not(:disabled)') ?? cabinBtn).focus();
      return;
    }
    if ((e.target as HTMLElement).closest('[data-tp-apply]')) {
      pax = { ...draft };
      cabin = tp.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value ?? cabin;
      tpCommitted = true;
      cabinLabel();
      tp.close();
      return;
    }
    if ((e.target as HTMLElement).closest('[data-tp-close]')) { tp.close(); return; }
    if (e.target === tp) {
      const r = tp.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) tp.close();
    }
  });
  tp.addEventListener('close', () => {
    cabinBtn.setAttribute('aria-expanded', 'false');
    removeEventListener('scroll', onTpScroll, true);
    removeEventListener('resize', placeTp);
    cabinBtn.focus();
    if (tpCommitted) say(`${cabinVal.textContent} selected.`);
  });

  // ------------------------------------------------------------------ validation
  const legNo = (el: HTMLElement) => { const m = el.closest<HTMLElement>('[data-mleg]'); return m ? mlegs().indexOf(m) + 2 : 1; };
  const legOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-mleg]') ?? leg1;
  function message(el: HTMLElement): string | null {
    const f = el.dataset.field ?? el.dataset.dateBtn ?? '';
    const v = el instanceof HTMLInputElement ? el.value.trim() : el.dataset.value ?? '';
    const n = legNo(el);
    const pre = trip === 'multi' ? `Flight ${n}: ` : '';
    switch (f) {
      case 'from':
        return v ? null : `${pre}Enter the city or airport you're flying from.`;
      case 'to': {
        if (!v) return `${pre}Enter the city or airport you're flying to.`;
        const from = field(legOf(el), 'from').value.trim();
        return from && from.toLowerCase() === v.toLowerCase() ? `${pre}Choose a destination different from where you're flying from.` : null;
      }
      case 'depart': {
        if (!v) return `${pre}Choose a departure date.`;
        if (v < todayIso()) return `${pre}Choose a date from today onwards.`;
        const all = departBtns(); const i = all.indexOf(el as HTMLButtonElement);
        const prev = trip === 'multi' ? all.slice(0, i).map(dateOf).filter(Boolean).pop() : undefined;
        return prev && v < prev ? `Flight ${i + 1} can't depart before flight ${i}.` : null;
      }
      case 'return': {
        if (trip !== 'round') return null;
        if (!v) return 'Choose a return date.';
        const d = dateOf(dep1);
        return d && v < d ? 'Choose a return date on or after your departure date.' : null;
      }
      case 'name':
        return v ? null : 'Enter your name.';
      case 'email':
        return !v ? 'Enter your email address.' : EMAIL_RE.test(v) ? null : 'Enter a valid email address, like name@example.com.';
      case 'phone':
        return !v ? 'Enter your phone number.' : phoneOk(v) ? null : 'Enter a valid phone number, including the area code.';
    }
    return null;
  }
  function setErr(el: HTMLElement, msg: string | null) {
    const id = el.getAttribute('aria-describedby')?.split(' ')[0];
    const p = id ? document.getElementById(id) : null;
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (p) { p.textContent = msg ?? ''; p.hidden = !msg; }
  }
  const check = (el: HTMLElement) => { const m = message(el); setErr(el, m); return !m; };
  function tripControls(): HTMLElement[] {
    const out: HTMLElement[] = [field(leg1, 'from'), field(leg1, 'to'), dep1];
    if (trip === 'round') out.push(ret1);
    if (trip === 'multi') for (const l of mlegs()) out.push(field(l, 'from'), field(l, 'to'), q('[data-date-btn]', l));
    return out;
  }
  const contactControls = () => ['name', 'email', 'phone'].map((n) => field(root, n));
  const validate = (els: HTMLElement[]) => els.filter((el) => !check(el));

  form.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.field && el.getAttribute('aria-invalid')) check(el);
    alertEl.textContent = '';
  });
  form.addEventListener('focusout', (e) => {
    const el = e.target as HTMLElement;
    if (attempted && el instanceof HTMLInputElement && el.dataset.field && el.type !== 'checkbox' && (step === 'contact' || !contactControls().includes(el))) check(el);
  });

  // ------------------------------------------------------------------ steps + submit
  const submitBtns = [...form.querySelectorAll<HTMLButtonElement>('[data-submit]')];
  submitBtns.forEach((b) => { b.dataset.label = b.textContent!.trim(); });
  // Turnstile (only with a site key): rendered when the contact step opens; a token is required before sending
  const tsErr = root.querySelector<HTMLElement>('[data-ts-err]');
  const setTsErr = (msg: string) => { if (tsErr) { tsErr.textContent = msg; tsErr.hidden = !msg; } };
  const ts = turnstileFor(root.querySelector<HTMLElement>('[data-turnstile-slot]'), form.dataset.turnstile, {
    theme: 'dark',
    onChange: (token) => { if (token) setTsErr(''); },
  });
  const ensureTurnstile = () => ts?.ensure();

  function goContact() {
    step = 'contact';
    root.dataset.step = 'contact';
    footBtn.textContent = footBtn.dataset.label = 'Get your Booking';
    field(root, 'name').focus();
    say('Almost done. Let us know where we can send your flight options.');
    emit('quote:step', { step });
    ensureTurnstile();
  }

  /** Server field error path (enquiry contract, e.g. `legs.1.date`, `returnDate`, `email`) -> the control showing it. */
  function controlFor(path: string): HTMLElement | null {
    const m = /^legs\.(\d+)\.(from|to|date)$/.exec(path);
    if (m) {
      const i = Number(m[1]);
      const leg = i === 0 ? leg1 : mlegs()[i - 1];
      if (!leg) return null;
      return m[2] === 'date' ? (i === 0 ? dep1 : q<HTMLButtonElement>('[data-date-btn]', leg)) : field(leg, m[2]);
    }
    if (path === 'returnDate') return trip === 'round' ? ret1 : null;
    if (['name', 'email', 'phone'].includes(path)) return field(root, path);
    return null;   // travellers / cabin / tripType / turnstileToken ...: shown in the alert
  }

  function setBusy(on: boolean) {
    busy = on;
    for (const b of submitBtns) {
      b.disabled = on;
      if (on) { b.setAttribute('aria-busy', 'true'); b.textContent = 'Sending…'; }
      else { b.removeAttribute('aria-busy'); b.textContent = b.dataset.label!; }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    closeList(false);
    attempted = true;
    const tripBad = validate(tripControls());
    if (step === 'trip') {
      if (tripBad.length) { tripBad[0].focus(); say(`Please check ${tripBad.length === 1 ? '1 field' : `${tripBad.length} fields`}.`); return; }
      goContact();
      return;
    }
    const bad = [...tripBad, ...validate(contactControls())];
    if (bad.length) { bad[0].focus(); say(`Please check ${bad.length === 1 ? '1 field' : `${bad.length} fields`}.`); return; }
    if (ts && !ts.token()) {
      await ts.ensure();
      setTsErr('Please complete the security check above, then try again.');
      say('Please complete the security check.');
      return;
    }
    alertEl.textContent = '';
    const submitter = (e.submitter as HTMLButtonElement | null) ?? footBtn;
    setBusy(true);
    const val = (el: HTMLInputElement) => el.value.trim();
    const legs = [{ from: val(field(leg1, 'from')), to: val(field(leg1, 'to')), date: dateOf(dep1) }];
    if (trip === 'multi') for (const l of mlegs()) legs.push({ from: val(field(l, 'from')), to: val(field(l, 'to')), date: dateOf(q('[data-date-btn]', l)) });
    const res = await submitEnquiry(form, {
      kind: 'quote',
      tripType: TRIP_API[trip],
      cabin: cabin as 'business',
      travellers: { ...pax },
      legs,
      returnDate: trip === 'round' ? dateOf(ret1) : undefined,
      name: val(field(root, 'name')),
      email: val(field(root, 'email')),
      phone: val(field(root, 'phone')),
      smsConsent: field(root, 'smsConsent').checked,
    }, t0);
    if (res.ok) {
      emit('quote:submitted');
      location.assign(THANK_YOU_URL);
      return;
    }
    setBusy(false);
    let first: HTMLElement | null = null;
    const unmapped: string[] = [];
    for (const [path, msg] of Object.entries(res.fieldErrors ?? {})) {
      if (path === 'turnstileToken') { setTsErr(msg); continue; }
      const el = controlFor(path);
      if (el) { setErr(el, msg); first ??= el; } else unmapped.push(msg);
    }
    alertEl.textContent = [res.message, ...unmapped].join(' ');
    ts?.reset();
    (first ?? submitter).focus();
  });
}
