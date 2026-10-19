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

  // ------------------------------------------------------------------ input masks
  const digits = (v: string) => v.replace(/\D/g, '');
  const mask = (f: string, fn: (v: string) => string) => qa<HTMLInputElement>(`input[data-f="${f}"]`).forEach((el) =>
    el.addEventListener('input', () => { const v = fn(el.value); if (v !== el.value) el.value = v; }));
  mask('dob', (v) => { const d = digits(v).slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/'); });
  mask('card', (v) => digits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '));
  mask('exp', (v) => { const d = digits(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; });
  mask('cvv', (v) => digits(v).slice(0, 4));

  // ------------------------------------------------------------------ date of birth calendar (native picker)
  const isoToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  qa<HTMLButtonElement>('[data-cal]').forEach((btn) => {
    const field = btn.closest('.trip__field')!;
    const text = q<HTMLInputElement>('input[data-f="dob"]', field);
    const cal = q<HTMLInputElement>('[data-cal-in]', field);
    cal.max = isoToday;
    btn.addEventListener('click', () => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.value.trim());
      cal.value = m ? `${m[3]}-${m[1]}-${m[2]}` : '';
      try { cal.showPicker(); } catch { text.focus(); }   // no picker support: typing still works
    });
    cal.addEventListener('change', () => {
      const [y, mo, d] = cal.value.split('-');
      if (!y) return;
      text.value = `${mo}/${d}/${y}`;
      text.dispatchEvent(new Event('input', { bubbles: true }));
      check(text);
      text.focus();
    });
  });

  // ------------------------------------------------------------------ validation
  const today = new Date();
  const luhn = (n: string) => { let s = 0; for (let i = 0; i < n.length; i++) { let x = Number(n[n.length - 1 - i]); if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } return s % 10 === 0; };
  function message(el: HTMLInputElement): string {
    const v = el.value.trim();
    switch (el.dataset.f) {
      case 'first': return v ? '' : 'Enter the first name as in the passport.';
      case 'last': return v ? '' : 'Enter the last name as in the passport.';
      case 'dob': {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
        if (!m) return 'Enter the date of birth as MM/DD/YYYY.';
        const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
        if (d.getMonth() !== Number(m[1]) - 1 || d > today || Number(m[3]) < 1900) return 'Enter a real date of birth.';
        return '';
      }
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
  const errOf = (el: HTMLElement) => el.closest('.trip__field')?.querySelector<HTMLElement>('.trip__err') ?? null;
  function check(el: HTMLInputElement) {
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
  root.addEventListener('input', (e) => { const el = e.target as HTMLInputElement; if (el.matches('input[data-f]') && el.getAttribute('aria-invalid')) check(el); });
  root.addEventListener('focusout', (e) => { const el = e.target as HTMLInputElement; if (el.matches('input[data-f]') && el.closest('[data-step]')?.hasAttribute('data-tried')) check(el); });
  function validStep(s: Step) {
    const sec = q(`[data-step="${s}"]`);
    sec.setAttribute('data-tried', '');
    const bad = qa<HTMLInputElement>('input[data-f]', sec).filter((el) => !check(el));
    if (bad.length) { bad[0].focus(); say(`Please check ${bad.length === 1 ? '1 field' : `${bad.length} fields`}.`); return false; }
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
  picks.forEach((b) => b.addEventListener('click', () => choosePlan(b.dataset.plan!)));
  const modal = q<HTMLDialogElement>('[data-noprot]');
  q('[data-modal-close]', modal).addEventListener('click', () => modal.close());
  q('[data-modal-add]', modal).addEventListener('click', () => {
    modal.close();
    const pop = plans.find((p) => p.popular) ?? plans[0];
    if (pop) { choosePlan(pop.id); picks.find((b) => b.dataset.plan === pop.id)?.focus(); }
  });
  q('[data-modal-skip]', modal).addEventListener('click', () => { modal.close(); choosePlan('none'); show('payment'); });
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
    if (step === 'protection' && (plan === null || plan === 'none')) { modal.showModal(); return; }
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
    items[active].scrollIntoView({ block: 'nearest' });
  };
  const choose = (i: number) => {
    items.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    wrap.dataset.value = items[i].dataset.value;
    val.textContent = items[i].textContent;
  };
  const onOutside = (e: Event) => { if (!wrap.contains(e.target as Node)) close(false); };
  function open() {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, items.findIndex((li) => li.getAttribute('aria-selected') === 'true')));
    list.focus();
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
