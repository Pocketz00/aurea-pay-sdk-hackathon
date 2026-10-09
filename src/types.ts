/**
 * Serialized API shapes. Mirrors what the server returns.
 *
 * Money: every `amount` field is an **integer number of minor units**
 * (cents for EUR). Never pass a float — `4.99` is a bug, use `499`. The
 * SDK validates at call-sites and throws `AureaInvalidRequestError` on
 * non-integer input before the HTTP call is made.
 *
 * Timestamps are UNIX seconds.
 */

export type Currency = 'EUR'
export type PaymentMethod = 'sepa' | 'card'
export type Mode = 'live' | 'test'
export type CheckoutSessionStatus = 'open' | 'complete' | 'expired' | 'canceled'

/**
 * Integer minor units (cents). Re-exported from `./validate` for ergonomic
 * use in caller code:
 *
 *   import { Aurea, type MinorUnits } from '@aureahub/pay'
 *   const amount: MinorUnits = 499 // €4.99
 */
export type { MinorUnits } from './validate'

export interface CheckoutSession {
  id:                 string
  object:             'checkout.session'
  mode:               Mode
  status:             CheckoutSessionStatus
  /** Integer minor units (cents). E.g. `499` = €4.99. */
  amount:             number
  currency:           Currency
  external_reference: string | null
  customer_email:     string | null
  locale:             string | null
  payment_methods:    PaymentMethod[]
  metadata:           Record<string, unknown> | null
  success_url:        string
  cancel_url:         string
  url:                string
  expires_at:         number
  completed_at:       number | null
  canceled_at:        number | null
  created:            number
}

export interface CreateCheckoutSessionParams {
  /** Integer minor units (cents). E.g. `499` = €4.99. Floats throw synchronously. */
  amount:             number
  currency:           Currency
  success_url:        string
  cancel_url:         string
  external_reference?: string
  customer_email?:    string
  locale?:            string
  payment_methods?:   PaymentMethod[]
  metadata?:          Record<string, unknown>
  expires_in?:        number
}

export interface ListParams {
  limit?:          number
  starting_after?: string
  ending_before?:  string
}

export interface ListResponse<T> {
  object:   'list'
  data:     T[]
  has_more: boolean
}

export interface Refund {
  id:                 string
  object:             'refund'
  checkout_session:   string
  /** Integer minor units (cents). */
  amount:             number
  currency:           Currency
  reason:             string | null
  rail:               'mollie' | 'noah' | 'monerium'
  external_refund_id: string | null
  status:             'pending' | 'processing' | 'succeeded' | 'failed' | 'manual'
  error_message:      string | null
  metadata:           Record<string, unknown> | null
  created:            number
  processed_at:       number | null
}

export interface CreateRefundParams {
  checkout_session: string
  /**
   * Integer minor units (cents). Omit for a full refund. Floats throw
   * synchronously.
   */
  amount?:          number
  reason?:          string
  metadata?:        Record<string, unknown>
}

export interface WebhookEndpoint {
  id:          string
  object:      'webhook_endpoint'
  url:         string
  events:      string[]
  status:      'active' | 'disabled'
  description: string | null
  secret?:     string // only present in the immediate response to create
  created:     number
  updated:     number
}

export interface CreateWebhookEndpointParams {
  url:         string
  events?:     string[]
  description?: string
}

export interface Account {
  id:           string
  name:         string
  email:        string
  account_type: 'individual' | 'business'
  primary_rail: 'noah' | 'monerium'
  mode:         Mode
  /**
   * What buyers can actually see on the hosted checkout today — intersection
   * of rail readiness AND the merchant's account-level cap. Use this value
   * when rendering Aurea Pay on your own checkout page: if
   * `capabilities.sepa` is false, don't advertise SEPA to the buyer.
   */
  capabilities: {
    sepa: boolean
    card: boolean
  }
  /**
   * The raw account-level payment-methods cap set in the merchant dashboard.
   * Independent of rail readiness. Most integrations should prefer
   * `capabilities` above; this field is exposed so the merchant can detect
   * "capped off" vs "rail not ready" when showing internal admin UIs.
   */
  enabled_payment_methods: PaymentMethod[]
  onboarding: {
    noah:     string | null
    monerium: string | null
    mollie:   string | null
  }
  object: 'account'
}

/**
 * Webhook event types emitted by the Aurea platform. Widened with `(string & {})`
 * so a newly-added event type still type-checks (forward-compatible) while the
 * known ones give editor autocomplete. Additive since 0.3.6 — `event_type` /
 * `AureaEvent.type` were previously `string`, so this is not a breaking change.
 */
export type AureaEventType =
  | 'checkout.session.created'
  | 'checkout.session.completed'
  | 'checkout.session.expired'
  | 'checkout.session.canceled'
  | 'refund.created'
  | 'refund.succeeded'
  | 'refund.failed'
  | 'refund.updated'
  | 'payout.paid'
  | 'payout.failed'
  | (string & {})

export interface EventDelivery {
  id:              string
  object:          'event_delivery'
  event_id:        string
  event_type:      AureaEventType
  status:          'pending' | 'delivered' | 'failed' | 'dead'
  attempts:        number
  response_status: number | null
  last_error:      string | null
  endpoint_id:     string
  payload?:        unknown
  next_attempt_at: number | null
  created:         number
  delivered_at:    number | null
}
