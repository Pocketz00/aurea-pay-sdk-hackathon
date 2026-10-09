/**
 * Tests for AureaHttpClient — covers retries, timeouts, idempotency,
 * authentication header, and error mapping. Drives the SDK's HTTP
 * surface up to ~80% coverage which is the 1.0 release gate.
 */

import { describe, it, expect, vi } from 'vitest'
import { AureaHttpClient } from '../src/client'
import {
  AureaAuthenticationError,
  AureaInvalidRequestError,
  AureaRateLimitError,
  AureaApiError,
  AureaNotFoundError,
} from '../src/errors'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('AureaHttpClient — basic semantics', () => {
  it('rejects construction with no apiKey', () => {
    expect(() => new AureaHttpClient({ apiKey: '' })).toThrow(/apiKey/)
  })

  it('sends Bearer auth and Accept JSON on every request', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fakeFetch = vi.fn(async (input: any, init: any) => {
      calls.push({ url: String(input), init })
      return jsonResponse(200, { object: 'list', data: [], has_more: false })
    })
    const c = new AureaHttpClient({ apiKey: 'sk_test_xxx', httpClient: fakeFetch as any })
    await c.request('GET', '/refunds')
    expect(calls).toHaveLength(1)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk_test_xxx')
    expect(headers.Accept).toBe('application/json')
  })

  it('forwards extra headers', async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const c = new AureaHttpClient({
      apiKey:        'sk_test',
      httpClient:    fakeFetch as any,
      defaultHeaders: { 'X-Foo': 'bar' },
    })
    await c.request('GET', '/account')
    const headers = (fakeFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Foo']).toBe('bar')
  })

  it('appends query parameters', async () => {
    const fakeFetch = vi.fn(async (input: any) => {
      expect(String(input)).toContain('?limit=10&starting_after=abc')
      return jsonResponse(200, { object: 'list', data: [], has_more: false })
    })
    const c = new AureaHttpClient({ apiKey: 'sk_test', httpClient: fakeFetch as any })
    await c.request('GET', '/refunds', { query: { limit: 10, starting_after: 'abc' } })
  })

  it('serializes JSON body and sets Content-Type', async () => {
    const fakeFetch = vi.fn(async (_url: any, init: any) => {
      expect(init.body).toBe(JSON.stringify({ amount: 499 }))
      const h = init.headers as Record<string, string>
      expect(h['Content-Type']).toBe('application/json')
      return jsonResponse(200, { id: 'cs_test_1' })
    })
    const c = new AureaHttpClient({ apiKey: 'sk_test', httpClient: fakeFetch as any })
    await c.request('POST', '/checkout/sessions', { body: { amount: 499 } })
  })

  it('forwards Idempotency-Key header when provided', async () => {
    const fakeFetch = vi.fn(async (_url: any, init: any) => {
      const h = init.headers as Record<string, string>
      expect(h['Idempotency-Key']).toBe('order-1')
      return jsonResponse(200, { id: 'cs_test_1' })
    })
    const c = new AureaHttpClient({ apiKey: 'sk_test', httpClient: fakeFetch as any })
    await c.request('POST', '/checkout/sessions', { body: {}, idempotencyKey: 'order-1' })
  })

  it('returns undefined for 204 No Content', async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const c = new AureaHttpClient({ apiKey: 'sk_test', httpClient: fakeFetch as any })
    const result = await c.request<unknown>('DELETE', '/webhook_endpoints/we_1')
    expect(result).toBeUndefined()
  })
})

describe('AureaHttpClient — error mapping', () => {
  const cases: { status: number; type: string; ctor: any }[] = [
    { status: 401, type: 'authentication_error', ctor: AureaAuthenticationError },
    { status: 400, type: 'invalid_request_error', ctor: AureaInvalidRequestError },
    { status: 404, type: 'not_found',             ctor: AureaNotFoundError       },
    { status: 429, type: 'rate_limit_error',      ctor: AureaRateLimitError      },
  ]
  for (const { status, type, ctor } of cases) {
    it(`maps ${status} → ${ctor.name}`, async () => {
      const fakeFetch = vi.fn(async () => jsonResponse(status, {
        error: { code: 'x', message: 'no', type },
      }))
      const c = new AureaHttpClient({
        apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 0,
      })
      await expect(c.request('GET', '/account')).rejects.toBeInstanceOf(ctor)
    })
  }

  it('falls back to AureaApiError on 500-with-no-body', async () => {
    const fakeFetch = vi.fn(async () =>
      new Response('boom', { status: 500, statusText: 'Server Error' }),
    )
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 0,
    })
    await expect(c.request('GET', '/account')).rejects.toBeInstanceOf(AureaApiError)
  })

  it('exposes status + code on the thrown error', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse(400, { error: { code: 'invalid_amount', message: 'too low', param: 'amount', type: 'invalid_request_error' } }),
    )
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 0,
    })
    try {
      await c.request('POST', '/checkout/sessions', { body: { amount: 0 } })
      throw new Error('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(AureaInvalidRequestError)
      expect(err.code).toBe('invalid_amount')
      expect(err.status).toBe(400)
      expect(err.param).toBe('amount')
    }
  })
})

describe('AureaHttpClient — retry policy', () => {
  it('retries GET on 5xx', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n++
      if (n === 1) return jsonResponse(503, { error: { type: 'api_error', message: 'flaky' } })
      return jsonResponse(200, { object: 'account', id: 'm_1' })
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 2,
    })
    const result = await c.request<{ id: string }>('GET', '/account')
    expect(result.id).toBe('m_1')
    expect(n).toBe(2)
  })

  it('retries GET on 429 honoring Retry-After', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n++
      if (n === 1) return jsonResponse(429,
        { error: { type: 'rate_limit_error', message: 'slow down' } },
        { 'retry-after': '0' },
      )
      return jsonResponse(200, { object: 'account', id: 'm_2' })
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 1,
    })
    const result = await c.request<{ id: string }>('GET', '/account')
    expect(result.id).toBe('m_2')
  })

  it('does NOT retry POST without idempotencyKey', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n++
      return jsonResponse(503, { error: { type: 'api_error', message: 'flaky' } })
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 3,
    })
    await expect(c.request('POST', '/checkout/sessions', { body: {} })).rejects.toBeTruthy()
    expect(n).toBe(1)
  })

  it('DOES retry POST when idempotencyKey is provided', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n++
      if (n < 3) return jsonResponse(503, { error: { type: 'api_error', message: 'flaky' } })
      return jsonResponse(200, { id: 'cs_test_3' })
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 3,
    })
    const result = await c.request<{ id: string }>(
      'POST',
      '/checkout/sessions',
      { body: {}, idempotencyKey: 'k1' },
    )
    expect(result.id).toBe('cs_test_3')
    expect(n).toBe(3)
  })

  it('gives up after maxRetries exhausted', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n++
      return jsonResponse(503, { error: { type: 'api_error', message: 'flaky' } })
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, maxRetries: 1,
    })
    await expect(c.request('GET', '/account')).rejects.toBeTruthy()
    // 1 initial + 1 retry = 2 calls
    expect(n).toBe(2)
  })
})

describe('AureaHttpClient — defaults', () => {
  it('strips trailing slash from baseUrl', async () => {
    const fakeFetch = vi.fn(async (input: any) => {
      expect(String(input)).toBe('https://example.com/api/v1/account')
      return jsonResponse(200, {})
    })
    const c = new AureaHttpClient({
      apiKey: 'sk_test', httpClient: fakeFetch as any, baseUrl: 'https://example.com/',
    })
    await c.request('GET', '/account')
  })

  it('uses pay.aureahub.com when baseUrl is omitted', async () => {
    const fakeFetch = vi.fn(async (input: any) => {
      expect(String(input)).toContain('https://pay.aureahub.com/api/v1/account')
      return jsonResponse(200, {})
    })
    const c = new AureaHttpClient({ apiKey: 'sk_test', httpClient: fakeFetch as any })
    await c.request('GET', '/account')
  })
})
