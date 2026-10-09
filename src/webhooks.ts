/**
 * Webhook signature verification.
 *
 * Consumers call:
 *
 *   import { Webhook } from '@aureahub/pay/webhooks'
 *   const event = Webhook.constructEvent(rawBody, signatureHeader, endpointSecret)
 *
 * Returns the parsed event envelope if the signature is valid; throws
 * AureaSignatureError otherwise. Matches Stripe's API for familiarity.
 *
 * Signature format (header `Aurea-Signature`):
 *   t=<unix>,v1=<hex HMAC-SHA256(secret, t + '.' + body)>
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { AureaEventType } from './types'

/**
 * Reason codes for webhook verification failures. Exposed as an
 * enum-like string so apps can branch on the failure type without
 * parsing the human-readable message. The `message` itself is
 * deliberately generic so an attacker probing the endpoint cannot
 * distinguish "wrong secret" from "stale timestamp" purely by the
 * response surfaced to the caller's logs.
 */
export type AureaSignatureFailureCode =
  | 'missing_header'
  | 'missing_secret'
  | 'malformed_header'
  | 'timestamp_invalid'
  | 'timestamp_stale'
  | 'signature_mismatch'
  | 'invalid_json'

/** Generic message returned externally for any signature-related failure. */
const GENERIC_SIGNATURE_MESSAGE = 'Invalid webhook signature.'

export class AureaSignatureError extends Error {
  /** Machine-readable reason code. Safe to log, safe to branch on. */
  public readonly code: AureaSignatureFailureCode
  /** Internal detail for server-side logs only — never sent to callers. */
  public readonly detail: string

  constructor(code: AureaSignatureFailureCode, detail: string) {
    // Two classes of failure surface more detail because they're developer
    // configuration errors, not attacker probes. `missing_secret` means
    // the app forgot to pass AUREA_WEBHOOK_SECRET; `invalid_json` means
    // the signature was valid but the body isn't an event — that's an
    // upstream bug worth surfacing clearly.
    const exposeDetail = code === 'missing_secret' || code === 'invalid_json'
    super(exposeDetail ? detail : GENERIC_SIGNATURE_MESSAGE)
    this.name   = 'AureaSignatureError'
    this.code   = code
    this.detail = detail
  }
}

export interface AureaEvent {
  id:       string
  object:   'event'
  type:     AureaEventType
  livemode: boolean
  created:  number
  data:     { object: unknown }
}

export const Webhook = {
  /**
   * Verify the signature header against the raw request body and return the
   * parsed event. Throws AureaSignatureError on any mismatch.
   *
   * @param body       The raw request body EXACTLY as received (string or Buffer).
   *                   Do NOT pass a parsed-and-restringified object — whitespace
   *                   differences will break verification.
   * @param header     The value of the `Aurea-Signature` header.
   * @param secret     The endpoint's whsec_ signing secret.
   * @param tolerance  Max timestamp drift in seconds. Default 60.
   *                   Was 300 (5 min) before v0.2.0-beta.3 — tightened to
   *                   match the security plan: legitimate webhook delivery
   *                   completes in single-digit seconds, so a wider window
   *                   only helps an attacker replay a captured signature.
   *                   Bump explicitly if you have a use-case requiring it
   *                   (e.g. delayed-queue webhook processor).
   */
  constructEvent(
    body:       string | Buffer,
    header:     string | null | undefined,
    secret:     string,
    tolerance = 60,
  ): AureaEvent {
    if (!header) throw new AureaSignatureError('missing_header', 'Missing Aurea-Signature header.')
    if (!secret) throw new AureaSignatureError('missing_secret', 'Endpoint secret is required.')

    // Parse the header into a list of (key, value) pairs. Stripe-style
    // headers carry MULTIPLE v1 entries during a secret rotation grace
    // window (we sign with both old + new secret so consumers can roll
    // their config without dropping events). Object.fromEntries would
    // collapse duplicate keys and break verification — iterate instead.
    let tStr: string | null = null
    const v1List: string[] = []
    for (const segment of header.split(',')) {
      const trimmed = segment.trim()
      const eqIdx   = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const k = trimmed.slice(0, eqIdx)
      const v = trimmed.slice(eqIdx + 1)
      if (k === 't' && tStr === null) tStr = v
      else if (k === 'v1') v1List.push(v)
    }

    if (!tStr || v1List.length === 0) {
      throw new AureaSignatureError('malformed_header', 'Signature header missing t or v1 segment.')
    }

    const t = parseInt(tStr, 10)
    if (!Number.isFinite(t)) throw new AureaSignatureError('timestamp_invalid', 'Signature timestamp is not a number.')

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - t) > tolerance) {
      throw new AureaSignatureError('timestamp_stale', `Signature timestamp drift > ${tolerance}s.`)
    }

    const bodyStr = typeof body === 'string' ? body : body.toString('utf8')
    const expected = createHmac('sha256', secret).update(`${t}.${bodyStr}`).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')

    // Try every v1 entry; accept on the first that verifies. We always
    // visit every entry to keep timing constant — an attacker who can
    // observe verification latency shouldn't be able to learn which
    // entry matched.
    let matched = false
    for (const candidate of v1List) {
      const candBuf = Buffer.from(candidate, 'hex')
      if (candBuf.length === expectedBuf.length && timingSafeEqual(candBuf, expectedBuf)) {
        matched = true
        // intentionally NOT breaking — visit all entries for timing parity
      }
    }
    if (!matched) {
      throw new AureaSignatureError('signature_mismatch', 'HMAC verification failed.')
    }

    try {
      return JSON.parse(bodyStr) as AureaEvent
    } catch {
      throw new AureaSignatureError('invalid_json', 'Event body is not valid JSON.')
    }
  },
}
