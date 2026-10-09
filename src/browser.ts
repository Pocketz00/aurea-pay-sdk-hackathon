/**
 * Browser drop-in — `import { openCheckout } from '@aureahub/pay/browser'`.
 *
 * Given a checkout session ID (created on the merchant's server via the
 * main SDK), navigates to the Aurea Pay hosted checkout page. The hosted
 * page is served from the Aurea domain — the SDK never touches card data,
 * so PCI scope stays on Aurea.
 *
 * Redirect is currently the only supported mode. A modal/iframe mode is
 * not offered because the hosted checkout sets `Content-Security-Policy:
 * frame-ancestors 'none'` to prevent clickjacking; relaxing that
 * selectively is on the roadmap.
 *
 * Security: the redirect target MUST resolve to an Aurea-owned host.
 * If a merchant or attacker passes a `baseUrl` pointing somewhere else
 * (cache-poisoned config, malicious env var, MITM-rewritten config
 * blob), `openCheckout` throws rather than navigating. Without this
 * the SDK becomes a cooperating sink for phishing redirects.
 */

const ALLOWED_HOSTS = new Set<string>([
  'pay.aureahub.com',
  'aurea-payment-link.vercel.app',
  'aureapay.app',
  // localhost variants for local dev / e2e tests
  'localhost',
  '127.0.0.1',
])

function isAllowedRedirectTarget(rawBase: string): boolean {
  let u: URL
  try { u = new URL(rawBase) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase()
  if (ALLOWED_HOSTS.has(host)) return true
  // Also accept subdomains of aureahub.com (pay.*, sandbox.* etc.).
  if (host.endsWith('.aureahub.com')) return true
  if (host.endsWith('.aureapay.app')) return true
  return false
}

export class AureaCheckoutRedirectError extends Error {
  readonly code = 'unsafe_checkout_redirect'
  constructor(message: string) {
    super(message)
    this.name = 'AureaCheckoutRedirectError'
  }
}

export interface OpenCheckoutOptions {
  sessionId: string
  /** Override the hosted checkout host. Default: https://pay.aureahub.com */
  baseUrl?: string
}

export function openCheckout(opts: OpenCheckoutOptions): void {
  const base = (opts.baseUrl ?? 'https://pay.aureahub.com').replace(/\/$/, '')
  if (!isAllowedRedirectTarget(base)) {
    throw new AureaCheckoutRedirectError(
      `Refusing to redirect to non-Aurea host: ${base}`,
    )
  }
  if (!opts.sessionId || typeof opts.sessionId !== 'string') {
    throw new AureaCheckoutRedirectError('sessionId is required and must be a string')
  }
  const url = `${base}/pay/session/${encodeURIComponent(opts.sessionId)}`
  window.location.href = url
}
