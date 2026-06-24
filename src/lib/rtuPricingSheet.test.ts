import { describe, expect, it } from 'vitest'
import { DEFAULT_RTU_PRICING_ROWS } from '@/lib/rtuPricing.defaults'
import { RTU_PRICING } from '@/lib/costEstimator.pricing'
import {
  computeRtuAllInFromComponents,
  parseTonnageLabel,
  rowsToRtuPricing,
  buildRtuPricingUnit,
} from '@/lib/rtuPricingSheet'

describe('parseTonnageLabel', () => {
  it('parses tonnage from label text', () => {
    expect(parseTonnageLabel('7.5 Ton')).toBe(7.5)
    expect(parseTonnageLabel('50 Ton')).toBe(50)
  })
})

describe('computeRtuAllInFromComponents', () => {
  it('matches workbook all-in formula for 5 ton std', () => {
    const row = DEFAULT_RTU_PRICING_ROWS.find((r) => r.tonnageKey === 5)!
    expect(computeRtuAllInFromComponents(row, 'std')).toBe(33687)
    expect(computeRtuAllInFromComponents(row, 'hyb')).toBe(34679)
  })
})

describe('rowsToRtuPricing', () => {
  it('produces the same static pricing table as costEstimator.pricing', () => {
    const fromRows = rowsToRtuPricing(DEFAULT_RTU_PRICING_ROWS)
    expect(fromRows).toEqual(RTU_PRICING)
  })

  it('escalates hybrid years by 5%', () => {
    const unit = buildRtuPricingUnit(DEFAULT_RTU_PRICING_ROWS.find((r) => r.tonnageKey === 5)!)
    expect(unit.hyb['2026']).toBe(34679)
    expect(unit.hyb['2027']).toBe(Math.round(34679 * 1.05))
  })
})
