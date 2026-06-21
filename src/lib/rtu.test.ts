import legacyBuildings from '../../supabase/data/buildings.json'
import {
  normalizeLegacyBuilding,
  type LegacyBuildingJson,
  type Rtu,
} from '@/types/domain'
import { getRtuAge, getRtuYear, oldestRtuAge, rcbGetTons } from '@/lib/rtu'

const sampleBuildings = (legacyBuildings as LegacyBuildingJson[])
  .slice(0, 3)
  .map(normalizeLegacyBuilding)

describe('getRtuYear', () => {
  it('parses year from description', () => {
    const rtu = sampleBuildings[0]?.rtus?.[1]
    expect(rtu).toBeDefined()
    expect(getRtuYear(rtu!)).toBe(2021)
  })

  it('prefers install_year column when present', () => {
    const rtu = {
      name: 'RTU-X',
      description: 'Date Installed: Jan 01, 2010',
      lat: 0,
      lng: 0,
      install_year: 2024,
    }
    expect(getRtuYear(rtu)).toBe(2024)
  })
})

describe('getRtuAge', () => {
  it('computes age from install year', () => {
    const rtu = sampleBuildings[0]?.rtus?.[2]
    expect(rtu).toBeDefined()
    expect(getRtuAge(rtu!, 2026)).toBe(14)
  })
})

describe('oldestRtuAge', () => {
  it('returns max age across RTUs', () => {
    const building = sampleBuildings[0]
    expect(building).toBeDefined()
    expect(oldestRtuAge(building!, 2026)).toBeGreaterThanOrEqual(14)
  })
})

describe('rcbGetTons', () => {
  it('parses tonnage from parenthetical', () => {
    const rtu = sampleBuildings[0]?.rtus?.[0]
    expect(rtu).toBeDefined()
    expect(rcbGetTons(rtu!)).toBe(5)
  })

  it('derives tonnage from BTU when needed', () => {
    const rtu: Rtu = {
      name: 'RTU-test',
      description: 'Cooling Capacity: 60,000 BTU',
      lat: 0,
      lng: 0,
    }
    expect(rcbGetTons(rtu)).toBe(5)
  })
})
