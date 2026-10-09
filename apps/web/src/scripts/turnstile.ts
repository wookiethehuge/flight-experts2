/**
 * Cloudflare Turnstile ("verify you are human") for the enquiry forms. Only used when PUBLIC_TURNSTILE_SITE_KEY is
 * set at build time (the form then carries data-turnstile="<site key>" and a [data-turnstile-slot] element).
 * The widget mode (managed / non-interactive / invisible) is chosen on the Cloudflare dashboard; use "Managed".
 *
 * The api.js script is loaded once, on demand: `renderWhenNear` waits until the slot is near the viewport (or the
 * caller asks for it right away), so the script never competes with the LCP.
 * The token lands in a hidden input named cf-turnstile-response inside the slot (read by scripts/enquiry.ts) and
 * is verified server side by the CMS (TURNSTILE_SECRET_KEY).
 * Test keys: site 1x00000000000000000000AA (always passes) / secret 1x0000000000000000000000000000000AA.
 */
type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
};
const api = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

let script: Promise<void> | null = null;
export function loadTurnstile(): Promise<void> {
  return (script ??= new Promise<void>((resolve, reject) => {
    if (api()) return resolve();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { script = null; reject(new Error('turnstile')); };
    document.head.append(s);
  }));
}

export interface TurnstileHandle {
  /** Render now (if not yet). Resolves when the widget exists or the script failed to load. */
  ensure(): Promise<void>;
  /** Current token ('' when the check has not passed yet). */
  token(): string;
  reset(): void;
  /** true once the widget has been rendered */
  readonly ready: boolean;
}

export function turnstileFor(slot: HTMLElement | null, siteKey: string | undefined, opts: { theme?: 'light' | 'dark' | 'auto'; onChange?: (token: string) => void } = {}): TurnstileHandle | null {
  if (!slot || !siteKey) return null;
  let widget: string | undefined;
  let pending: Promise<void> | null = null;
  const handle: TurnstileHandle = {
    get ready() { return widget !== undefined; },
    ensure() {
      return (pending ??= loadTurnstile()
        .then(() => {
          widget ??= api()!.render(slot, {
            sitekey: siteKey,
            theme: opts.theme ?? 'auto',
            size: 'flexible',
            appearance: 'interaction-only',   // hidden unless Cloudflare actually needs the visitor to click
            'response-field-name': 'cf-turnstile-response',
            callback: (t: string) => opts.onChange?.(t),
            'expired-callback': () => opts.onChange?.(''),
            'error-callback': () => opts.onChange?.(''),
          });
        })
        .catch(() => { pending = null; }));
    },
    token() {
      return (widget !== undefined && api()?.getResponse(widget)) || slot.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value || '';
    },
    reset() { if (widget !== undefined) api()?.reset(widget); opts.onChange?.(''); },
  };
  return handle;
}

/** Render the widget once the page has loaded and its form comes within ~400px of the viewport. */
export function renderWhenNear(handle: TurnstileHandle | null, el: Element) {
  if (!handle) return;
  // never during the initial page load (keeps the LCP / main thread free), then as soon as the form is near
  if (document.readyState !== 'complete') { addEventListener('load', () => renderWhenNear(handle, el), { once: true }); return; }
  if (!('IntersectionObserver' in window)) { handle.ensure(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); handle.ensure(); }
  }, { rootMargin: '400px 0px' });
  io.observe(el);
}
