/**
 * Aurea Pay SDK — main server-side entry point.
 *
 * @packageDocumentation
 *
 * @example Basic usage
 * ```ts
 * import { Aurea } from '@aureahub/pay'
 *
 * const aurea = new Aurea({ apiKey: process.env.AUREA_SECRET! })
 *
 * const session = await aurea.checkout.sessions.create({
 *   amount:        2499,           // minor units — €24.99
 *   currency:      'EUR',
 *   success_url:   'https://merchant.example/done',
 *   cancel_url:    'https://merchant.example/cancel',
 * })
 * res.redirect(session.urls.hosted)
 * ```
 *
 * @example Verifying a webhook
 * ```ts
 * import { Webhook, AureaSignatureError } from '@aureahub/pay'
 *
 * try {
 *   const event = Webhook.constructEvent(
 *     rawBody, req.header('Aurea-Signature'), process.env.AUREA_WEBHOOK_SECRET!,
 *   )
 *   if (event.type === 'checkout.session.completed') { ... }
 * } catch (err) {
 *   if (err instanceof AureaSignatureError) {
 *     // err.code is one of: 'missing_header' | 'malformed_header' |
 *     //   'timestamp_invalid' | 'timestamp_stale' | 'signature_mismatch' |
 *     //   'invalid_json' | 'missing_secret'
 *   }
 * }
 * ```
 */

import { AureaHttpClient, type AureaClientOptions } from './client'
import {
  CheckoutSessions, Refunds, WebhookEndpoints, Events, AccountResource,
} from './resources'

/**
 * Top-level SDK client. Configure with your API key (`sk_live_*` or
 * `sk_test_*`) and access typed resources as fields.
 *
 * @public
 */
export class Aurea {
  /**
   * Hosted checkout sessions. The most common entry point — create a
   * session, redirect the payer to `session.urls.hosted`, await the
   * settlement webhook.
   */
  public readonly checkout: { sessions: CheckoutSessions }
  /** Refund lifecycle for settled sessions. */
  public readonly refunds:          Refunds
  /** Manage outbound webhook endpoints (URLs that receive signed events). */
  public readonly webhookEndpoints: WebhookEndpoints
  /** Inspect and replay event delivery history. */
  public readonly events:           Events
  /** The authenticated merchant's account info. */
  public readonly account:          AccountResource

  /**
   * @param opts.apiKey REQUIRED. Aurea API key, `sk_live_*` / `sk_test_*` /
   *   `pk_*`. Publishable keys (`pk_*`) can only call read-only endpoints.
   * @param opts.baseUrl Override the API host. Defaults to
   *   `https://pay.aureahub.com`.
   * @param opts.timeout Per-request timeout in ms. Defaults to 10_000.
   * @param opts.maxRetries Max additional attempts for transient
   *   failures (429, 5xx). Defaults to 2 (so up to 3 attempts total).
   *   POST/PATCH/DELETE only retry if the call provided an idempotency
   *   key — see resource methods for usage.
   * @param opts.httpClient Inject a custom fetch (e.g. `nock`-aware) for tests.
   */
  constructor(opts: AureaClientOptions) {
    const http = new AureaHttpClient(opts)
    this.checkout = { sessions: new CheckoutSessions(http) }
    this.refunds          = new Refunds(http)
    this.webhookEndpoints = new WebhookEndpoints(http)
    this.events           = new Events(http)
    this.account          = new AccountResource(http)
  }
}

export default Aurea
export * from './types'
export * from './errors'
export { Webhook, AureaSignatureError, type AureaEvent } from './webhooks'
