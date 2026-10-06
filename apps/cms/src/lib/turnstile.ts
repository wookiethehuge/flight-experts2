/**
 * Cloudflare Turnstile verification (only when TURNSTILE_SECRET_KEY is set).
 * Fails open on network errors or Cloudflare outages (logged) so real leads are not lost; the honeypot,
 * timing check and rate limit still apply.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  log: (msg: string) => void,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token || typeof token !== 'string' || token.length > 2048) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      log(`[turnstile] verify HTTP ${res.status}; allowing`)
      return true
    }
    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!json.success) log(`[turnstile] rejected: ${(json['error-codes'] ?? []).join(',')}`)
    return Boolean(json.success)
  } catch (err) {
    log(`[turnstile] verify failed (${(err as Error).message}); allowing`)
    return true
  }
}
