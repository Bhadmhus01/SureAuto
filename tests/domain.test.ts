import { describe, expect, it } from 'vitest'
import { CHECKS, VEHICLES, freshness, quote, rollback, validVin } from '../src/domain'

describe('VIN rules', () => {
  it('requires 17 characters and rejects I, O and Q', () => {
    expect(validVin('2T2BZMCA0JC123456')).toBe(true)
    expect(validVin('2t2bzmca0jc123456')).toBe(true)
    expect(validVin('INVALID')).toBe(false)
    expect(validVin('2T2BZMCAOJC123456')).toBe(false)
  })
})
describe('freshness and never-pay-twice pricing', () => {
  it('returns a zero quote for fresh findings', () => expect(quote(VEHICLES[0].dates)).toBe(0))
  it('quotes precisely one stale check at ₦2,500', () => {
    expect(quote(VEHICLES[2].dates)).toBe(2500)
    expect(freshness('2026-08-21', 30).overdue).toBe(18)
  })
  it('quotes a six-check missing bundle at ₦15,000', () => expect(quote({})).toBe(15000))
  it('expires exactly at the configured window', () => {
    const now = new Date('2026-10-08T00:00:00Z')
    expect(freshness('2026-09-09', 30, now).fresh).toBe(true)
    expect(freshness('2026-09-08', 30, now).fresh).toBe(false)
  })
  it('does not treat an invalid date as fresh', () => expect(freshness('invalid',30).fresh).toBe(false))
  it('uses distinct policy windows', () => expect(CHECKS.map(c=>c.days)).toEqual([365,30,90,730,90,90]))
})
describe('mileage discrepancy detection', () => {
  it('reports the amount of decrease', () => expect(rollback(65000,20000)).toBe(45000))
  it('does not flag increasing mileage', () => expect(rollback(65000,68200)).toBe(0))
})
