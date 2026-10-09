/**
 * Typed error classes for the Aurea Pay SDK.
 *
 * Every non-2xx response from the Partner API is translated into one of
 * these so consumers can do:
 *
 *   try { await aurea.checkout.sessions.create(...) }
 *   catch (e) {
 *     if (e instanceof AureaInvalidRequestError) { ... }
 *   }
 */

export interface AureaErrorPayload {
  code?:    string
  message?: string
  type?:    string
  param?:   string
}

export class AureaError extends Error {
  public code:    string
  public type:    string
  public param?:  string
  public status?: number

  constructor(payload: AureaErrorPayload, status?: number) {
    super(payload.message ?? 'Aurea Pay request failed')
    this.name   = 'AureaError'
    this.code   = payload.code ?? 'unknown'
    this.type   = payload.type ?? 'api_error'
    this.param  = payload.param
    this.status = status
  }
}

export class AureaAuthenticationError extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaAuthenticationError' } }
export class AureaInvalidRequestError  extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaInvalidRequestError'  } }
export class AureaIdempotencyError     extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaIdempotencyError'     } }
export class AureaRateLimitError       extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaRateLimitError'       } }
export class AureaApiError             extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaApiError'             } }
export class AureaNotFoundError        extends AureaError { constructor(p: AureaErrorPayload, s?: number) { super(p, s); this.name = 'AureaNotFoundError'        } }

export function errorFromPayload(payload: AureaErrorPayload, status: number): AureaError {
  switch (payload.type) {
    case 'authentication_error':  return new AureaAuthenticationError(payload, status)
    case 'invalid_request_error': return new AureaInvalidRequestError(payload,  status)
    case 'idempotency_error':     return new AureaIdempotencyError(payload,     status)
    case 'rate_limit_error':      return new AureaRateLimitError(payload,       status)
    case 'not_found':             return new AureaNotFoundError(payload,        status)
    default:                      return new AureaApiError(payload,             status)
  }
}
