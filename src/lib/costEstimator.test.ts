import legacyBuildings from '../../supabase/data/buildings.json'
import {
  formatRtuTons,
  rcbBuildScheduledExport,
  rcbCompute,
  rcbCostForTier,
  rcbLineItemsForBuilding,
  rcbLineItemsWithReplacementYears,
  rcbMoney,
  rcbProjection,
  rcbReplacementYearKey,
  rcbSanitizeReplacementYearAssignments,
  rcbTierBreakdownForItems,
  rcbTierFor,
  rcbUnitCost,
} from '@/lib/costEstimator'
import { RTU_PRICING } from '@/lib/costEstimator.pricing'
import {
  normalizeLegacyBuilding,
  type LegacyBuildingJson,
} from '@/types/domain'

const buildings = (legacyBuildings as LegacyBuildingJson[]).map(
  normalizeLegacyBuilding,
)

describe('rcbMoney', () => {
  it('formats CAD currency', () => {
    expect(rcbMoney(25927)).toBe('$25,927')
  })
})

describe('formatRtuTons', () => {
  it('formats whole and fractional tonnage', () => {
    expect(formatRtuTons(5)).toBe('5 Ton')
    expect(formatRtuTons(7.5)).toBe('7.5 Ton')
    expect(formatRtuTons(null)).toBe('—')
  })
})

describe('rcbTierFor', () => {
  it('rounds up to next tier', () => {
    const match = rcbTierFor(2.5)
    expect(match?.tier).toBe(2.5)
    expect(match?.unit.l).toBe('2.5 Ton')
  })

  it('caps above 50 tons', () => {
    const match = rcbTierFor(75)
    expect(match?.tier).toBe(50)
  })
})

describe('rcbUnitCost', () => {
  it('returns hybrid 2026 cost', () => {
    const unit = RTU_PRICING['5']
    expect(unit).toBeDefined()
    expect(rcbUnitCost(unit!, 'hyb', '2026')).toBe(34679)
  })
})

describe('rcbCompute', () => {
  it('computes replacement totals for filtered buildings', () => {
    const subset = buildings.filter((b) => b.address === '1850 Derry Road East')
    const result = rcbCompute(subset, {
      basis: 'hyb',
      year: '2026',
      threshold: 10,
      currentYear: 2026,
    })
    expect(result.totals.units).toBeGreaterThan(0)
    expect(result.totals.cost).toBeGreaterThan(0)
    expect(result.lineItems.length).toBe(result.totals.units)
    const first = result.lineItems[0]
    expect(first).toBeDefined()
    expect(first?.serial).toBeTruthy()
    expect(first?.model).toBeTruthy()
  })

  it('groups line items and tiers per building', () => {
    const subset = buildings.filter((b) => b.address === '1850 Derry Road East')
    const result = rcbCompute(subset, {
      basis: 'hyb',
      year: '2026',
      threshold: 10,
      currentYear: 2026,
    })
    const items = rcbLineItemsForBuilding(result, '1850 Derry Road East')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.address === '1850 Derry Road East')).toBe(true)
    const tiers = rcbTierBreakdownForItems(items)
    expect(tiers.reduce((sum, tier) => sum + tier.qty, 0)).toBe(items.length)
  })

  it('applies per-RTU replacement years with projected pricing', () => {
    const subset = buildings.filter((b) => b.address === '1850 Derry Road East')
    const result = rcbCompute(subset, {
      basis: 'hyb',
      year: '2026',
      threshold: 10,
      currentYear: 2026,
    })
    const base = rcbLineItemsForBuilding(result, '1850 Derry Road East')
    const first = base[0]
    expect(first).toBeDefined()

    const baseCost2026 = rcbCostForTier(first!.tierKey, 'hyb', '2026')
    const baseCost2028 = rcbCostForTier(first!.tierKey, 'hyb', '2028')
    expect(baseCost2026).toBeTruthy()
    expect(baseCost2028).toBeGreaterThan(baseCost2026!)

    const key = `${first!.address}::${first!.rtu}`
    const scheduled = rcbLineItemsWithReplacementYears(base, 'hyb', '2026', {
      [key]: '2028',
    })
    const scheduledItem = scheduled.find((item) => item.rtu === first!.rtu)
    expect(scheduledItem?.replacementYear).toBe('2028')
    expect(scheduledItem?.cost).toBe(baseCost2028)
  })

  it('sanitizes assignments when default year changes', () => {
    const assignments = {
      'A::RTU-01': '2027',
      'B::RTU-02': '2028',
    }
    expect(
      rcbSanitizeReplacementYearAssignments(assignments, ['2026', '2027', '2028'], '2027'),
    ).toEqual({ 'B::RTU-02': '2028' })
  })

  it('builds scheduled export totals from per-RTU replacement years', () => {
    const subset = buildings.filter((b) => b.address === '1850 Derry Road East')
    const result = rcbCompute(subset, {
      basis: 'hyb',
      year: '2026',
      threshold: 10,
      currentYear: 2026,
    })
    const base = rcbLineItemsForBuilding(result, '1850 Derry Road East')
    const first = base[0]
    expect(first).toBeDefined()
    const key = rcbReplacementYearKey(first!.address, first!.rtu)
    const scheduled = rcbBuildScheduledExport(result, { [key]: '2028' })
    expect(scheduled.customizedCount).toBe(1)
    expect(scheduled.totals.cost).toBeGreaterThan(result.totals.cost)
    expect(scheduled.perBldg[0]?.cost).toBe(scheduled.totals.cost)
    expect(scheduled.items.find((item) => item.rtu === first!.rtu)?.replacementYear).toBe('2028')
  })
})

describe('rcbProjection', () => {
  it('projects costs across hybrid years', () => {
    const subset = buildings.filter((b) => b.address === '1850 Derry Road East')
    const result = rcbCompute(subset, {
      basis: 'hyb',
      year: '2026',
      threshold: 10,
      currentYear: 2026,
    })
    const projection = rcbProjection(result)
    expect(projection.length).toBe(7)
    expect(projection[0]?.year).toBe('2026')
    expect(projection[0]?.total).toBeGreaterThan(0)
  })
})
