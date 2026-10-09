/**
 * Tests for openCheckout — the browser drop-in. Verifies the host
 * allowlist and redirect target construction.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { openCheckout, AureaCheckoutRedirectError } from '../src/browser'

describe('openCheckout', () => {
  let originalLocation: any
  beforeEach(() => {
    originalLocation = (globalThis as any).window?.location
    ;(globalThis as any).window = { location: { href: '' } }
  })
  afterEach(() => {
    if (originalLocation) (globalThis as any).window = { location: originalLocation }
    else delete (globalThis as any).window
  })

  it('redirects to default host when baseUrl omitted', () => {
    openCheckout({ sessionId: 'cs_test_1' })
    expect((globalThis as any).window.location.href).toBe(
      'https://pay.aureahub.com/pay/session/cs_test_1',
    )
  })

  it('accepts an explicit allowed host', () => {
    openCheckout({ sessionId: 'cs_test_2', baseUrl: 'https://aurea-payment-link.vercel.app' })
    expect((globalThis as any).window.location.href).toBe(
      'https://aurea-payment-link.vercel.app/pay/session/cs_test_2',
    )
  })

  it('accepts subdomains of aureahub.com', () => {
    openCheckout({ sessionId: 'cs_test_3', baseUrl: 'https://sandbox.aureahub.com' })
    expect((globalThis as any).window.location.href).toBe(
      'https://sandbox.aureahub.com/pay/session/cs_test_3',
    )
  })

  it('strips trailing slash from baseUrl', () => {
    openCheckout({ sessionId: 'cs_test_4', baseUrl: 'https://pay.aureahub.com/' })
    expect((globalThis as any).window.location.href).toBe(
      'https://pay.aureahub.com/pay/session/cs_test_4',
    )
  })

  it('refuses non-Aurea hosts', () => {
    expect(() =>
      openCheckout({ sessionId: 'cs_test_5', baseUrl: 'https://attacker.example' }),
    ).toThrow(AureaCheckoutRedirectError)
  })

  it('refuses http for non-loopback hosts', () => {
    expect(() =>
      openCheckout({ sessionId: 'cs_test_6', baseUrl: 'http://pay.aureahub.com' }),
    ).toThrow(AureaCheckoutRedirectError)
  })

  it('refuses URLs with credentials', () => {
    expect(() =>
      openCheckout({ sessionId: 'cs_test_7', baseUrl: 'https://u:p@pay.aureahub.com' }),
    ).toThrow(AureaCheckoutRedirectError)
  })

  it('refuses missing sessionId', () => {
    expect(() => openCheckout({ sessionId: '' as any })).toThrow(AureaCheckoutRedirectError)
  })

  it('encodes the sessionId', () => {
    openCheckout({ sessionId: 'a b/c' })
    expect((globalThis as any).window.location.href).toContain('a%20b%2Fc')
  })

  it('allows http://localhost', () => {
    openCheckout({ sessionId: 'cs_dev', baseUrl: 'http://localhost:3000' })
    expect((globalThis as any).window.location.href).toBe(
      'http://localhost:3000/pay/session/cs_dev',
    )
  })
})
