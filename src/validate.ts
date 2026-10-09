/**
 * Client-side validators — catch obvious mistakes before the HTTP call so
 * callers get synchronous, stack-traceable errors instead of opaque 400s
 * from the server.
 *
 * Money is the most important of these: the Aurea Pay API speaks in
 * integer minor units (cents) and silently passing a float like `9.99`
 * would lead to IEEE-754 rounding bugs downstream. Fail loudly.
 */

import { AureaInvalidRequestError } from './errors'

/**
 * An integer number of minor units (cents). EUR only today.
 *
 *   10000   → €100.00
 *   499     → €4.99
 *
 * Do NOT pass a float. `4.99` is a bug — use `499` instead.
 */
export type MinorUnits = number

/** Server-side maximum (€100,000.00 in cents). Matches the Partner API cap. */
const MAX_AMOUNT_MINOR_UNITS = 10_000_000

/** Server-side minimum — at least 1 cent; zero-value checkouts are not supported. */
const MIN_AMOUNT_MINOR_UNITS = 1

export function assertMinorUnits(value: unknown, param: string): asserts value is MinorUnits {
  if (typeof value !== 'number') {
    throw new AureaInvalidRequestError(
      {
        code:    'invalid_amount',
        type:    'invalid_request_error',
        param,
        message: `\`${param}\` must be a number of integer minor units (cents), got ${typeof value}.`,
      },
      400,
    )
  }
  if (!Number.isFinite(value)) {
    throw new AureaInvalidRequestError(
      { code: 'invalid_amount', type: 'invalid_request_error', param,
        message: `\`${param}\` must be finite.` },
      400,
    )
  }
  if (!Number.isInteger(value)) {
    throw new AureaInvalidRequestError(
      { code: 'invalid_amount', type: 'invalid_request_error', param,
        message: `\`${param}\` must be an integer number of minor units (cents). Did you pass ${value} when you meant ${Math.round(value * 100)}?` },
      400,
    )
  }
  if (value < MIN_AMOUNT_MINOR_UNITS) {
    throw new AureaInvalidRequestError(
      { code: 'invalid_amount', type: 'invalid_request_error', param,
        message: `\`${param}\` must be at least ${MIN_AMOUNT_MINOR_UNITS} (one cent).` },
      400,
    )
  }
  if (value > MAX_AMOUNT_MINOR_UNITS) {
    throw new AureaInvalidRequestError(
      { code: 'invalid_amount', type: 'invalid_request_error', param,
        message: `\`${param}\` must not exceed ${MAX_AMOUNT_MINOR_UNITS} (€100,000.00).` },
      400,
    )
  }
}

export function assertOptionalMinorUnits(value: unknown, param: string): asserts value is MinorUnits | undefined {
  if (value === undefined || value === null) return
  assertMinorUnits(value, param)
}
