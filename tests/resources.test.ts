/**
 * Smoke tests for resource classes — verifies the right HTTP method,
 * path, and body shape are produced. The HTTP transport is stubbed via
 * httpClient so we test the SDK's request shaping in isolation from
 * network behaviour (which is covered separately in client.test.ts).
 */

import { describe, it, expect, vi } from 'vitest'
import { Aurea } from '../src/index'
import { AureaInvalidRequestError } from '../src/errors'

interface Captured { method: string; url: string; body?: unknown; headers: Record<string, string> }

function buildClient(handler: (req: Captured) => Response) {
  const captured: Captured[] = []
  const fakeFetch = vi.fn(async (input: any, init: any) => {
    const url = String(input)
    const headers = init?.headers as Record<string, string>
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    const c: Captured = { method: init.method, url, body, headers }
    captured.push(c)
    return handler(c)
  })
  const aurea = new Aurea({
    apiKey:     'sk_test_xxx',
    httpClient: fakeFetch as any,
    baseUrl:    'https://api.example',
  })
  return { aurea, captured }
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

describe('CheckoutSessions', () => {
  it('create rejects float amounts before HTTP', async () => {
    const { aurea } = buildClient(() => ok({}))
    // assertMinorUnits throws synchronously inside .create() — wrap so
    // the assertion sees a rejection regardless of whether the throw
    // happens sync or async.
    await expect(async () => {
      await aurea.checkout.sessions.create({
        amount: 4.99 as any, currency: 'EUR',
        success_url: 'https://x', cancel_url: 'https://y',
      })
    }).rejects.toBeInstanceOf(AureaInvalidRequestError)
  })

  it('create POSTs to /checkout/sessions with body', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'cs_test_1', status: 'open' }))
    await aurea.checkout.sessions.create({
      amount: 499, currency: 'EUR',
      success_url: 'https://x', cancel_url: 'https://y',
    }, { idempotencyKey: 'k1' })
    expect(captured[0].method).toBe('POST')
    expect(captured[0].url).toContain('/api/v1/checkout/sessions')
    expect(captured[0].body).toMatchObject({ amount: 499, currency: 'EUR' })
    expect(captured[0].headers['Idempotency-Key']).toBe('k1')
  })

  it('retrieve GETs /checkout/sessions/:id', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'cs_test_1' }))
    await aurea.checkout.sessions.retrieve('cs test 1') // intentionally has space
    expect(captured[0].method).toBe('GET')
    // encodeURIComponent must escape the space
    expect(captured[0].url).toContain('cs%20test%201')
  })

  it('list GETs with query parameters', async () => {
    const { aurea, captured } = buildClient(() => ok({ object: 'list', data: [], has_more: false }))
    await aurea.checkout.sessions.list({ limit: 25, status: 'complete' })
    expect(captured[0].method).toBe('GET')
    expect(captured[0].url).toContain('limit=25')
    expect(captured[0].url).toContain('status=complete')
  })

  it('cancel POSTs to /:id/cancel', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'cs_test_1', status: 'canceled' }))
    await aurea.checkout.sessions.cancel('cs_test_1')
    expect(captured[0].method).toBe('POST')
    expect(captured[0].url).toContain('/checkout/sessions/cs_test_1/cancel')
  })

  it('simulate POSTs to /:id/simulate', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'cs_test_1', status: 'complete' }))
    await aurea.checkout.sessions.simulate('cs_test_1')
    expect(captured[0].method).toBe('POST')
    expect(captured[0].url).toContain('/checkout/sessions/cs_test_1/simulate')
  })
})

describe('Refunds', () => {
  it('create rejects float amounts', async () => {
    const { aurea } = buildClient(() => ok({}))
    await expect(async () => {
      await aurea.refunds.create({ checkout_session: 'cs_x', amount: 4.99 as any })
    }).rejects.toBeInstanceOf(AureaInvalidRequestError)
  })

  it('create accepts undefined amount (full refund)', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 're_1', status: 'pending' }))
    await aurea.refunds.create({ checkout_session: 'cs_1' })
    expect(captured[0].method).toBe('POST')
    expect(captured[0].body).toEqual({ checkout_session: 'cs_1' })
  })

  it('list GETs /refunds with query', async () => {
    const { aurea, captured } = buildClient(() => ok({ object: 'list', data: [], has_more: false }))
    await aurea.refunds.list({ checkout_session: 'cs_1', limit: 5 })
    expect(captured[0].url).toContain('checkout_session=cs_1')
    expect(captured[0].url).toContain('limit=5')
  })
})

describe('WebhookEndpoints', () => {
  it('create POSTs', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'we_1', secret: 'whsec_x' }))
    await aurea.webhookEndpoints.create({
      url:    'https://merchant.example/wh',
      events: ['checkout.session.completed'],
    })
    expect(captured[0].method).toBe('POST')
    expect((captured[0].body as any).url).toBe('https://merchant.example/wh')
  })

  it('test triggers a ping event', async () => {
    const { aurea, captured } = buildClient(() => ok({ ok: true, event_id: 'evt_1' }))
    const r = await aurea.webhookEndpoints.test('we_1')
    expect(r.event_id).toBe('evt_1')
    expect(captured[0].url).toContain('/webhook_endpoints/we_1/test')
  })

  it('delete sends DELETE', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'we_1', deleted: true }))
    await aurea.webhookEndpoints.delete('we_1')
    expect(captured[0].method).toBe('DELETE')
  })

  it('update sends PATCH with subset of fields', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'we_1', status: 'disabled' }))
    await aurea.webhookEndpoints.update('we_1', { status: 'disabled' })
    expect(captured[0].method).toBe('PATCH')
    expect(captured[0].body).toEqual({ status: 'disabled' })
  })
})

describe('Events', () => {
  it('list GETs with optional filters', async () => {
    const { aurea, captured } = buildClient(() => ok({ object: 'list', data: [], has_more: false }))
    await aurea.events.list({ status: 'failed', endpoint_id: 'we_1' })
    expect(captured[0].url).toContain('status=failed')
    expect(captured[0].url).toContain('endpoint_id=we_1')
  })

  it('resend POSTs to /events/:id/resend', async () => {
    const { aurea, captured } = buildClient(() => ok({ ok: true }))
    await aurea.events.resend('evt_1')
    expect(captured[0].method).toBe('POST')
    expect(captured[0].url).toContain('/events/evt_1/resend')
  })
})

describe('AccountResource', () => {
  it('retrieve GETs /account', async () => {
    const { aurea, captured } = buildClient(() => ok({ id: 'm_1', mode: 'test' }))
    const r = await aurea.account.retrieve()
    expect(r).toEqual({ id: 'm_1', mode: 'test' })
    expect(captured[0].method).toBe('GET')
    expect(captured[0].url).toContain('/api/v1/account')
  })
})
