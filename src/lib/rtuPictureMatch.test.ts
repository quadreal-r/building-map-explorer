import { describe, expect, it } from 'vitest'
import {
  extractRtuUnitId,
  findRtuCandidates,
  matchFileToRtu,
  normalizeRtuUnitCore,
  parseBulkRtuPictureFileName,
} from './rtuPictureMatch'
import { buildRtuCatalog } from './rtuBulkPictureImport'
import { normalizeLegacyBuilding, type LegacyBuildingJson } from '@/types/domain'
import legacyBuildings from '../../supabase/data/buildings.json'

const buildings = (legacyBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding)
const catalog = buildRtuCatalog(buildings)

describe('normalizeRtuUnitCore (review criteria)', () => {
  it('strips year and leading zeros from filename units', () => {
    expect(normalizeRtuUnitCore('RTU-06-2024')).toBe('6')
    expect(normalizeRtuUnitCore('RTU-06')).toBe('6')
    expect(normalizeRtuUnitCore('RT-06')).toBe('6')
    expect(normalizeRtuUnitCore('RTU 06')).toBe('6')
  })

  it('strips Hybrid and other DB descriptors', () => {
    expect(normalizeRtuUnitCore('RTU-06 Hybrid')).toBe('6')
    expect(normalizeRtuUnitCore('RTU-16A Hybrid')).toBe('16A')
    expect(normalizeRtuUnitCore('RTU-09 (Air Heater)')).toBe('9')
    expect(normalizeRtuUnitCore('RTU-03 (split AC unit)')).toBe('3')
  })

  it('accepts RTUs- and S- prefix variants', () => {
    expect(normalizeRtuUnitCore('RTUs-01')).toBe('1')
    expect(normalizeRtuUnitCore('S-01')).toBe('1')
  })

  it('does not collapse west suffix into numeric unit', () => {
    expect(normalizeRtuUnitCore('RT-1W')).toBe('1W')
    expect(normalizeRtuUnitCore('RTU-01')).toBe('1')
    expect(normalizeRtuUnitCore('RT-1W')).not.toBe(normalizeRtuUnitCore('RTU-01'))
  })

  it('flags unit 0 for manual review', () => {
    expect(normalizeRtuUnitCore('RTU-0')).toBeNull()
    expect(normalizeRtuUnitCore('RTU-00')).toBeNull()
  })
})

describe('parseBulkRtuPictureFileName', () => {
  it('parses year-in-unit filenames', () => {
    const parsed = parseBulkRtuPictureFileName('1495-RTU-06-2024-2.jpg')
    expect(parsed).toMatchObject({
      buildingNum: '1495',
      unitCore: '6',
      pictureIndex: 2,
      requiresReview: false,
    })
  })
})

describe('matchFileToRtu against portfolio', () => {
  it('matches 1495-RTU-06-2024-2.jpg to RTU-06 Hybrid', () => {
    const result = matchFileToRtu(catalog, '1495-RTU-06-2024-2.jpg')
    expect(result.error).toBeUndefined()
    expect(result.entry?.rtu.name).toBe('RTU-06 Hybrid')
    expect(result.pictureIndex).toBe(2)
  })

  it('matches RTUs-01 to RTU-01', () => {
    const parsed = parseBulkRtuPictureFileName('150-RTUs-01-1.jpg')
    expect(parsed).not.toBeNull()
    const candidates = findRtuCandidates(catalog, parsed!)
    expect(candidates.some((c) => c.rtu.name === 'RTU-01')).toBe(true)
  })

  it('rejects RTU-0 bulk dumps', () => {
    const result = matchFileToRtu(catalog, '150-RTU-0-1.jpg')
    expect(result.error).toContain('manual review')
  })

  it('does not match RT-1W to RTU-01', () => {
    const parsed = parseBulkRtuPictureFileName('150-RT-1W-1.jpg')!
    const candidates = findRtuCandidates(catalog, parsed)
    expect(candidates.some((c) => normalizeRtuUnitCore(c.rtu.name) === '1')).toBe(false)
  })
})

describe('extractRtuUnitId', () => {
  it('handles prefix variants', () => {
    expect(extractRtuUnitId('RT-04')).toBe('04')
    expect(extractRtuUnitId('RTU- 04')).toBe('04')
    expect(extractRtuUnitId('RTUs-01')).toBe('01')
    expect(extractRtuUnitId('S-01')).toBe('01')
  })
})
