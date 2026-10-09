/**
 * Amount-validation tests.
 *
 * Money handling is the load-bearing correctness check in the SDK; a float
 * slipping through to the server (or worse, to a buyer) is the bug we
 * added `assertMinorUnits` to prevent. If this test file ever goes red,
 * somebody loosened the validator — revert rather than relax it.
 */

import { describe, it, expect } from 'vitest'
import { assertMinorUnits, assertOptionalMinorUnits } from '../src/validate'
import { AureaInvalidRequestError } from '../src/errors'

describe('assertMinorUnits', () => {
  it('accepts a positive integer', () => {
    expect(() => assertMinorUnits(499, 'amount')).not.toThrow()
    expect(() => assertMinorUnits(1, 'amount')).not.toThrow()
    expect(() => assertMinorUnits(10_000_000, 'amount')).not.toThrow()
  })

  it('rejects zero', () => {
    expect(() => assertMinorUnits(0, 'amount')).toThrow(AureaInvalidRequestError)
  })

  it('rejects negatives', () => {
    expect(() => assertMinorUnits(-1, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(-100, 'amount')).toThrow(AureaInvalidRequestError)
  })

  it('rejects floats (the bug we care about most)', () => {
    expect(() => assertMinorUnits(4.99, 'amount')).toThrow(/integer/)
    expect(() => assertMinorUnits(0.1, 'amount')).toThrow(AureaInvalidRequestError)
    // The classic IEEE-754 sum that silently breaks payments.
    expect(() => assertMinorUnits(0.1 + 0.2, 'amount')).toThrow(AureaInvalidRequestError)
  })

  it('rejects NaN and Infinity', () => {
    expect(() => assertMinorUnits(NaN, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(Infinity, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(-Infinity, 'amount')).toThrow(AureaInvalidRequestError)
  })

  it('rejects non-numbers', () => {
    expect(() => assertMinorUnits('499', 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(null, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(undefined, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits({}, 'amount')).toThrow(AureaInvalidRequestError)
    expect(() => assertMinorUnits(499n, 'amount')).toThrow(AureaInvalidRequestError)
  })

  it('rejects amounts above the €100k cap', () => {
    expect(() => assertMinorUnits(10_000_001, 'amount')).toThrow(/100,000/)
  })

  it('sets the param name on the thrown error', () => {
    try { assertMinorUnits(4.99, 'my_amount'); expect.fail('should have thrown') }
    catch (e: any) {
      expect(e).toBeInstanceOf(AureaInvalidRequestError)
      expect(e.param).toBe('my_amount')
      expect(e.code).toBe('invalid_amount')
    }
  })
})

describe('assertOptionalMinorUnits', () => {
  it('accepts undefined / null', () => {
    expect(() => assertOptionalMinorUnits(undefined, 'amount')).not.toThrow()
    expect(() => assertOptionalMinorUnits(null, 'amount')).not.toThrow()
  })

  it('still rejects floats when present', () => {
    expect(() => assertOptionalMinorUnits(4.99, 'amount')).toThrow(AureaInvalidRequestError)
  })
})
