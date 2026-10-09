import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { Webhook, AureaSignatureError } from '../src/webhooks'

function signedHeader(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return { header: `t=${t},v1=${mac}`, t }
}

describe('Webhook.constructEvent', () => {
  const secret = 'whsec_test_secret_abc123'
  const body = JSON.stringify({ id: 'evt_1', object: 'event', type: 'ping', livemode: false, created: 1, data: { object: {} } })

  it('accepts a valid signature', () => {
    const { header } = signedHeader(secret, body)
    const event = Webhook.constructEvent(body, header, secret)
    expect(event.id).toBe('evt_1')
  })

  it('rejects a tampered body', () => {
    const { header } = signedHeader(secret, body)
    expect(() => Webhook.constructEvent(body + ' ', header, secret)).toThrow(AureaSignatureError)
  })

  it('rejects a wrong secret', () => {
    const { header } = signedHeader(secret, body)
    expect(() => Webhook.constructEvent(body, header, 'wrong_secret')).toThrow(AureaSignatureError)
  })

  it('rejects stale timestamps', () => {
    const { header } = signedHeader(secret, body, Math.floor(Date.now() / 1000) - 10000)
    expect(() => Webhook.constructEvent(body, header, secret)).toThrow(AureaSignatureError)
  })

  it('rejects missing header', () => {
    expect(() => Webhook.constructEvent(body, null, secret)).toThrow(AureaSignatureError)
  })

  it('exposes a machine-readable code on the thrown error', () => {
    try { Webhook.constructEvent(body, null, secret); throw new Error('should have thrown') }
    catch (e) {
      expect(e).toBeInstanceOf(AureaSignatureError)
      expect((e as AureaSignatureError).code).toBe('missing_header')
    }
  })

  it('returns a generic external message for signature-class failures', () => {
    // Both "stale timestamp" and "wrong secret" must surface the same
    // generic message to external callers so an attacker can't probe the
    // endpoint and distinguish failure modes by response text.
    const { header: stale } = signedHeader(secret, body, Math.floor(Date.now() / 1000) - 10000)
    let messages: string[] = []
    for (const [hdr, sec] of [[stale, secret], [signedHeader(secret, body).header, 'wrong']] as const) {
      try { Webhook.constructEvent(body, hdr, sec) }
      catch (e) { messages.push((e as Error).message) }
    }
    expect(new Set(messages).size).toBe(1)
    expect(messages[0]).toBe('Invalid webhook signature.')
  })

  it('still exposes detail for developer config errors', () => {
    // `missing_secret` and `invalid_json` are developer mistakes, not
    // attacker probes — surface a useful message.
    try { Webhook.constructEvent(body, 't=1,v1=x', '') }
    catch (e) { expect((e as Error).message).toMatch(/secret/) }
  })
})
