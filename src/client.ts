/**
 * AureaClient — the thin HTTP wrapper around the Partner API.
 *
 * Uses the global `fetch` (Node ≥ 18, all modern browsers). No runtime
 * dependencies beyond that.
 *
 * Consumers can pass their own fetch-compatible function via `httpClient`
 * for testing or when running on an older runtime.
 */

import { errorFromPayload } from './errors'

export interface AureaClientOptions {
  /** Secret (sk_*) or publishable (pk_*) API key. */
  apiKey: string
  /** Override for local testing / staging environments. Defaults to https://pay.aureahub.com. */
  baseUrl?: string
  /**
   * Per-request timeout in milliseconds. Default: 10_000. Tight enough that
   * a checkout flow doesn't stall a buyer's browser if the network hangs;
   * bump it if you're on a slow backend and can tolerate longer waits.
   */
  timeout?: number
  /**
   * Maximum number of retries for transient failures (429 and 5xx). The
   * initial attempt is NOT counted. Default: 2 (so up to 3 attempts total).
   * Set to 0 to disable retries.
   *
   * Retries apply only to GETs automatically. POST/PATCH/DELETE retry only
   * when the caller supplied an `idempotencyKey` — otherwise the SDK would
   * risk creating duplicate checkout sessions / refunds behind your back.
   */
  maxRetries?: number
  /** Custom fetch implementation (e.g. for tests). */
  httpClient?: typeof fetch
  /** Extra default headers — merged into every request. */
  defaultHeaders?: Record<string, string>
}

export interface RequestOptions {
  /** Stripe-style idempotency key. */
  idempotencyKey?: string
}

export class AureaHttpClient {
  private apiKey:    string
  private baseUrl:   string
  private timeout:   number
  private maxRetries: number
  private fetchImpl: typeof fetch
  private extraHeaders: Record<string, string>

  constructor(opts: AureaClientOptions) {
    if (!opts.apiKey) throw new Error('AureaClient: apiKey is required')
    this.apiKey     = opts.apiKey
    this.baseUrl    = (opts.baseUrl ?? 'https://pay.aureahub.com').replace(/\/$/, '')
    this.timeout    = opts.timeout ?? 10_000
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2)
    this.fetchImpl  = opts.httpClient ?? (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined as never)
    this.extraHeaders = opts.defaultHeaders ?? {}
    if (!this.fetchImpl) {
      throw new Error('AureaClient: global fetch is not available; pass `httpClient` explicitly.')
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path:   string,
    opts: {
      query?: Record<string, string | number | boolean | undefined | null>
      body?:  unknown
      idempotencyKey?: string
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`)
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue
        url.searchParams.set(k, String(v))
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept:        'application/json',
      ...this.extraHeaders,
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

    // Retry policy:
    //   - GETs are safe to retry unconditionally (no server-side state
    //     mutation). The server already treats duplicate GETs as a cache
    //     miss at worst.
    //   - POST/PATCH/DELETE are retried ONLY when an idempotencyKey was
    //     supplied. Without it a retry could create a duplicate session,
    //     duplicate refund, etc. — worse than the transient error we're
    //     trying to paper over.
    const canRetry = method === 'GET' || Boolean(opts.idempotencyKey)
    const attempts = canRetry ? this.maxRetries + 1 : 1

    let lastErr: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController()
      const timer      = setTimeout(() => controller.abort(), this.timeout)

      let res: Response
      try {
        res = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        })
      } catch (err) {
        lastErr = err
        // Network-level failure (abort / ENOTFOUND / ECONNREFUSED).
        if (attempt === attempts - 1) throw err
        await sleep(backoffMs(attempt))
        continue
      } finally {
        clearTimeout(timer)
      }

      // Non-2xx + retryable status? Back off and try again. Honour the
      // server's Retry-After header when present (supports both "seconds"
      // and HTTP-date forms; we only use seconds to keep this simple).
      if ((res.status === 429 || res.status >= 500) && attempt < attempts - 1) {
        const hinted = parseRetryAfterMs(res.headers.get('retry-after'))
        await sleep(hinted ?? backoffMs(attempt))
        continue
      }

      // Handle no-content responses
      if (res.status === 204) return undefined as T

      let json: unknown
      try { json = await res.json() } catch { json = {} }

      if (!res.ok) {
        const payload = (json && typeof json === 'object' && 'error' in json)
          ? (json as { error: { code?: string; message?: string; type?: string; param?: string } }).error
          : { message: res.statusText }
        throw errorFromPayload(payload, res.status)
      }

      return json as T
    }

    // Should be unreachable — the loop either returns or throws.
    throw lastErr ?? new Error('Aurea request failed after retries')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Exponential backoff with jitter. `attempt` is zero-indexed:
 *   attempt 0 → 400–500 ms
 *   attempt 1 → 800–1000 ms
 *   attempt 2 → 1600–2000 ms
 */
function backoffMs(attempt: number): number {
  const base  = 400 * Math.pow(2, attempt)
  const jitter = Math.random() * (base / 4)
  return base + jitter
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null
  const secs = Number(header)
  if (Number.isFinite(secs) && secs >= 0 && secs <= 120) return secs * 1000
  return null
}
