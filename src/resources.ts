/**
 * Typed resource wrappers — checkout sessions, refunds, webhook endpoints,
 * events, account. Each has .create / .retrieve / .list / .etc semantics.
 */

import type { AureaHttpClient } from './client'
import type {
  CheckoutSession, CreateCheckoutSessionParams, ListParams, ListResponse,
  Refund, CreateRefundParams,
  WebhookEndpoint, CreateWebhookEndpointParams,
  EventDelivery, Account,
} from './types'
import { assertMinorUnits, assertOptionalMinorUnits } from './validate'

/**
 * Checkout session resource. A checkout session represents a single
 * payment attempt — it is created up front, the payer is redirected to
 * Aurea's hosted page, and the session moves through the lifecycle:
 * `open → complete | expired | canceled`.
 *
 * @public
 */
export class CheckoutSessions {
  constructor(private http: AureaHttpClient) {}

  /**
   * Create a new hosted checkout session. The returned object's
   * `urls.hosted` field is the URL to redirect the payer to.
   *
   * @param params Session parameters. `amount` is in MINOR units
   *   (e.g. cents): pass `499` for €4.99, never `4.99`.
   * @param opts.idempotencyKey Optional. If provided, the same key
   *   replayed within 24h returns the original session rather than
   *   creating a new one. Strongly recommended for retried requests.
   *
   * @throws {AureaInvalidRequestError} if `amount` is not a positive
   *   integer in minor units, or any other validation fails server-side.
   *
   * @example
   * ```ts
   * const session = await aurea.checkout.sessions.create(
   *   {
   *     amount:        2499,
   *     currency:      'EUR',
   *     success_url:   'https://merchant.example/orders/123/done',
   *     cancel_url:    'https://merchant.example/orders/123/cancel',
   *     external_reference: 'order-123',
   *     payment_methods: ['card', 'sepa'],
   *   },
   *   { idempotencyKey: 'order-123-create' },
   * )
   * res.redirect(session.urls.hosted)
   * ```
   */
  create(params: CreateCheckoutSessionParams, opts: { idempotencyKey?: string } = {}) {
    // Amount is minor units (cents). Fail here rather than forwarding a
    // float to the API and getting a rounding bug later.
    assertMinorUnits(params.amount, 'amount')
    return this.http.request<CheckoutSession>('POST', '/checkout/sessions', {
      body: params, idempotencyKey: opts.idempotencyKey,
    })
  }

  /**
   * Retrieve a checkout session by id.
   * @param id Session id, e.g. `cs_live_…` or `cs_test_…`.
   */
  retrieve(id: string) {
    return this.http.request<CheckoutSession>('GET', `/checkout/sessions/${encodeURIComponent(id)}`)
  }

  /**
   * List checkout sessions, newest first.
   * Supports cursor pagination via `starting_after` / `ending_before`.
   *
   * @param params.limit Max items per page (default 10, hard cap 100).
   * @param params.starting_after Cursor — return sessions after this id.
   * @param params.ending_before Cursor — return sessions before this id.
   * @param params.status Filter by status: `open` / `complete` / `expired` / `canceled`.
   */
  list(params: ListParams & { status?: string } = {}) {
    return this.http.request<ListResponse<CheckoutSession>>('GET', '/checkout/sessions', { query: { ...params } })
  }

  /**
   * Cancel an open checkout session. No-op if the session is already
   * complete, expired, or canceled (returns the session in its current
   * state). Does NOT issue a refund — use {@link Refunds.create} for
   * that on a paid session.
   */
  cancel(id: string) {
    return this.http.request<CheckoutSession>('POST', `/checkout/sessions/${encodeURIComponent(id)}/cancel`)
  }

  /**
   * Test-mode-only: simulate a successful settlement WITHOUT actually
   * hitting any payment rail. Useful for end-to-end testing of webhook
   * delivery, completion redirects, and post-payment merchant logic.
   *
   * The session must have been created with a `sk_test_…` key. The
   * server rejects the call on live keys with `403 insufficient_privilege`.
   *
   * @example
   * ```ts
   * const session = await aurea.checkout.sessions.create({ ... })  // sk_test_*
   * // ... your test runner verifies state, redirects, etc.
   * await aurea.checkout.sessions.simulate(session.id)
   * // session.status is now 'complete'; checkout.session.completed
   * // webhook fired to your registered endpoints.
   * ```
   */
  simulate(id: string) {
    return this.http.request<CheckoutSession>('POST', `/checkout/sessions/${encodeURIComponent(id)}/simulate`)
  }
}

/**
 * Refund resource. Refunds reverse a settled checkout session, in full
 * or in part. Card refunds are typically processed near-instantly via
 * the card rail; SEPA refunds require manual operator action and are
 * marked `manual` in the response.
 *
 * @public
 */
export class Refunds {
  constructor(private http: AureaHttpClient) {}

  /**
   * Create a refund against a settled checkout session.
   *
   * @param params.checkout_session id of the session to refund.
   * @param params.amount Optional. When omitted, refunds the full
   *   remaining balance. When present, MUST be an integer number of
   *   minor units (e.g. `500` for €5.00).
   * @param params.reason Optional human-readable reason saved on the
   *   refund record. Visible to the merchant in the dashboard.
   * @param opts.idempotencyKey Strongly recommended. Same key replayed
   *   within 24h returns the same refund rather than creating a duplicate.
   *
   * @throws {AureaInvalidRequestError} if `amount` is present but not a
   *   positive integer.
   *
   * @example
   * ```ts
   * const refund = await aurea.refunds.create(
   *   { checkout_session: 'cs_live_…', amount: 499, reason: 'order cancelled' },
   *   { idempotencyKey: `refund-${order.id}` },
   * )
   * ```
   */
  create(params: CreateRefundParams, opts: { idempotencyKey?: string } = {}) {
    // Amount is optional (full refund when omitted) but if present must be
    // an integer number of minor units, same as checkout amounts.
    assertOptionalMinorUnits(params.amount, 'amount')
    return this.http.request<Refund>('POST', '/refunds', {
      body: params, idempotencyKey: opts.idempotencyKey,
    })
  }

  /** Retrieve a refund by id. */
  retrieve(id: string) {
    return this.http.request<Refund>('GET', `/refunds/${encodeURIComponent(id)}`)
  }

  /**
   * List refunds, newest first.
   * @param params.checkout_session Filter to refunds for a single session.
   */
  list(params: ListParams & { checkout_session?: string } = {}) {
    return this.http.request<ListResponse<Refund>>('GET', '/refunds', { query: { ...params } })
  }
}

/**
 * Webhook endpoint resource. A webhook endpoint is a URL on the
 * partner's infrastructure that receives signed event deliveries
 * (e.g. `checkout.session.completed`).
 *
 * @public
 */
export class WebhookEndpoints {
  constructor(private http: AureaHttpClient) {}

  /**
   * Register a new webhook endpoint. The response includes the signing
   * secret EXACTLY ONCE — store it securely on creation. Subsequent
   * retrievals return the endpoint metadata WITHOUT the secret.
   *
   * @example
   * ```ts
   * const ep = await aurea.webhookEndpoints.create({
   *   url:    'https://merchant.example/webhooks/aurea',
   *   events: ['checkout.session.completed', 'refund.succeeded'],
   * })
   * console.log(ep.secret)  // whsec_… — save now, can't be re-fetched
   * ```
   */
  create(params: CreateWebhookEndpointParams) {
    return this.http.request<WebhookEndpoint>('POST', '/webhook_endpoints', { body: params })
  }

  /** Retrieve a webhook endpoint by id (without the signing secret). */
  retrieve(id: string) {
    return this.http.request<WebhookEndpoint>('GET', `/webhook_endpoints/${encodeURIComponent(id)}`)
  }

  /** List all webhook endpoints owned by the API key's merchant. */
  list() {
    return this.http.request<ListResponse<WebhookEndpoint>>('GET', '/webhook_endpoints')
  }

  /**
   * Update an endpoint's URL, event subscriptions, status, or
   * description. Pass only the fields you want to change.
   *
   * Setting `status: 'disabled'` stops new deliveries but does NOT
   * cancel pending ones.
   */
  update(id: string, params: Partial<CreateWebhookEndpointParams & { status: 'active' | 'disabled' }>) {
    return this.http.request<WebhookEndpoint>('PATCH', `/webhook_endpoints/${encodeURIComponent(id)}`, { body: params })
  }

  /**
   * Delete a webhook endpoint. Cascades to its delivery history. A
   * disabled endpoint preserves history; only delete when you really
   * want the trail gone.
   */
  delete(id: string) {
    return this.http.request<{ id: string; deleted: true }>('DELETE', `/webhook_endpoints/${encodeURIComponent(id)}`)
  }

  /**
   * Send a signed `ping` event to the endpoint. Useful during initial
   * integration to verify the receiver is reachable and the signature
   * verifier is correctly wired up.
   *
   * Returns `{ ok: true, event_id }`. The actual delivery is async;
   * inspect {@link Events.list} a few seconds later to see the result.
   */
  test(id: string) {
    return this.http.request<{ ok: true; event_id: string }>('POST', `/webhook_endpoints/${encodeURIComponent(id)}/test`)
  }
}

/**
 * Event delivery resource. Each row is one attempt-set at delivering
 * an event to one endpoint. Failed deliveries follow exponential
 * backoff (1m → 5m → 30m → 2h → 12h) before moving to `dead`.
 *
 * @public
 */
export class Events {
  constructor(private http: AureaHttpClient) {}

  /**
   * List event deliveries, newest first.
   * @param params.endpoint_id Filter to deliveries for one endpoint.
   * @param params.status Filter by status: `pending` / `delivered` / `failed` / `dead`.
   * @param params.event_type Filter by event type, e.g. `checkout.session.completed`.
   */
  list(params: ListParams & { endpoint_id?: string; status?: string; event_type?: string } = {}) {
    return this.http.request<ListResponse<EventDelivery>>('GET', '/events', { query: { ...params } })
  }

  /** Retrieve a delivery (with payload + last error if any) by id. */
  retrieve(id: string) {
    return this.http.request<EventDelivery>('GET', `/events/${encodeURIComponent(id)}`)
  }

  /**
   * Resend a failed or dead delivery. The attempts counter resets so
   * the full retry budget is available again. No-op if the delivery
   * is already `delivered`.
   */
  resend(id: string) {
    return this.http.request<{ ok: true }>('POST', `/events/${encodeURIComponent(id)}/resend`)
  }
}

/**
 * Account resource. Returns information about the merchant whose
 * API key is making the call: identity, mode, primary rail, and
 * payment-method capabilities.
 *
 * @public
 */
export class AccountResource {
  constructor(private http: AureaHttpClient) {}

  /**
   * Retrieve the authenticated merchant's account info. Use this in
   * client onboarding flows to discover which payment methods the
   * merchant has enabled before showing options to payers.
   */
  retrieve() {
    return this.http.request<Account>('GET', '/account')
  }
}
