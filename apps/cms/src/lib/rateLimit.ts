/**
 * Simple in-memory sliding-window rate limiter (per process). Good enough for a single Node instance;
 * behind several instances use a shared store (Redis) or the CDN/WAF rate limiting instead.
 */
const hits = new Map<string, number[]>()
let lastSweep = Date.now()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  if (now - lastSweep > windowMs * 5) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k)
    lastSweep = now
  }
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (list.length >= limit) {
    hits.set(key, list)
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) }
  }
  list.push(now)
  hits.set(key, list)
  return { ok: true, retryAfter: 0 }
}

/**
 * Client IP. Prefers CDN headers, then X-Real-IP, then X-Forwarded-For counted from the right by
 * TRUSTED_PROXY_HOPS (default 1 = the address added by the proxy directly in front of this server).
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip') || headers.get('true-client-ip')
  if (cf) return cf.trim()
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (xff.length) {
    const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1)
    return xff[Math.max(0, xff.length - hops)]
  }
  return 'unknown'
}
