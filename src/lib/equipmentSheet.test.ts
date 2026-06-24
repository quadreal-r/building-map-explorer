import { describe, expect, it } from 'vitest'
import { normalizeRtuName, normalizeBuildingAddress } from '@/lib/rtuMatch'
import { applyEquipmentRowsToPortfolio } from '@/lib/equipmentSheet'
import { rcbReplacementYearKey, rcbScheduleYearOptions } from '@/lib/costEstimator'
import { normalizeLegacyBuilding, type LegacyBuildingJson } from '@/types/domain'
import legacyBuildings from '../../supabase/data/buildings.json'

const buildings = (legacyBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding)

describe('normalizeRtuName', () => {
  it('matches workbook and portfolio RTU labels', () => {
    expect(normalizeRtuName('RTU 02')).toBe(normalizeRtuName('RTU- 02'))
    expect(normalizeRtuName('RTU 04  Hybrid')).toBe(normalizeRtuName('RTU- 04 Hybrid'))
    expect(normalizeRtuName('RTU 01 DX Cooling Gas Fired Htg')).toBe(
      normalizeRtuName('RTU- 01'),
    )
  })
})

describe('applyEquipmentRowsToPortfolio', () => {
  it('maps replacement years by address and RTU number', () => {
    const leek = buildings.find((b) => b.address.includes('Leek'))
    expect(leek).toBeDefined()

    const result = applyEquipmentRowsToPortfolio(
      [
        {
          address: leek!.address,
          propertyAddress: leek!.address,
          rtuLabel: 'RTU 02',
          replacementYear: '2033',
          notes: 'Test note',
        },
      ],
      buildings,
    )

    const key = rcbReplacementYearKey(leek!.address, 'RTU- 02')
    expect(result.replacementYears[key]).toBe('2033')
    expect(result.notes[key]).toBe('Test note')
  })

  it('imports 4161 Sladeview replacement years and notes from workbook labels', () => {
    const result = applyEquipmentRowsToPortfolio(
      [
        {
          address: '4161 Sladeview Cres',
          propertyAddress: 'Western Business Park',
          rtuLabel: 'RTU 01 DX Cooling Gas Fired Htg',
          replacementYear: '2027',
          notes: 'replacement due to 20 year mark',
        },
        {
          address: '4161 Sladeview Cres',
          propertyAddress: 'Western Business Park',
          rtuLabel: 'RTU 05  Hybrid',
          replacementYear: '2025',
          notes: 'Done by Aquarius',
        },
        {
          address: '4161 Sladeview Cres',
          propertyAddress: 'Western Business Park',
          rtuLabel: 'RTU 12B DX Cooling Gas Fired Htg',
          replacementYear: null,
          notes: '',
        },
      ],
      buildings,
    )

    expect(result.stats.matchedYears).toBe(2)
    expect(result.stats.matchedNotes).toBe(2)
    expect(result.stats.unmatchedRtu).toBe(0)
    expect(result.replacementYears[rcbReplacementYearKey('4161 Sladeview Crescent', 'RTU- 01')]).toBe(
      '2027',
    )
    expect(
      result.replacementYears[rcbReplacementYearKey('4161 Sladeview Crescent', 'RTU- 05 Hybrid')],
    ).toBe('2025')
    expect(result.notes[rcbReplacementYearKey('4161 Sladeview Crescent', 'RTU- 01')]).toBe(
      'replacement due to 20 year mark',
    )
    expect(result.notes[rcbReplacementYearKey('4161 Sladeview Crescent', 'RTU- 05 Hybrid')]).toBe(
      'Done by Aquarius',
    )
  })

  it('skips zero replacement years', () => {
    const leek = buildings.find((b) => b.address.includes('Leek'))!
    const result = applyEquipmentRowsToPortfolio(
      [
        {
          address: leek.address,
          propertyAddress: leek.address,
          rtuLabel: 'RTU 08',
          replacementYear: null,
          notes: '',
        },
      ],
      buildings,
    )
    expect(Object.keys(result.replacementYears)).toHaveLength(0)
  })
})

describe('rcbScheduleYearOptions', () => {
  it('includes imported years outside the pricing table', () => {
    const years = rcbScheduleYearOptions('hyb', '2026', { 'a::b': '2033' })
    expect(years).toContain('2033')
    expect(years).toContain('2026')
  })
})

describe('normalizeBuildingAddress', () => {
  it('normalizes casing and trailing periods', () => {
    expect(normalizeBuildingAddress('100 Leek Crescent.')).toBe(
      normalizeBuildingAddress('100 leek crescent'),
    )
  })
})
