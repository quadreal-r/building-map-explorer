import { describe, expect, it } from 'vitest'
import legacyBuildings from '../../supabase/data/buildings.json'
import legacyPolygons from '../../supabase/data/polygons.json'
import { collectSearchHits } from '@/lib/searchHits'
import {
  normalizeLegacyBuilding,
  normalizeLegacyPolygon,
  type LegacyBuildingJson,
  type LegacyPolygonJson,
} from '@/types/domain'

const buildings = (legacyBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding)
const polygons = (legacyPolygons as LegacyPolygonJson[]).map(normalizeLegacyPolygon)

describe('collectSearchHits', () => {
  it('finds tenant polygon for Baxter and opens Unit # 3', () => {
    const hits = collectSearchHits(buildings, polygons, 'Baxter')
    expect(hits.length).toBeGreaterThan(0)
    const first = hits[0]!
    expect(first.kind).toBe('polygon')
    expect(first.polygonName).toMatch(/Unit #\s*3/i)
    expect(first.polygonDescription).toMatch(/Baxter/i)
  })

  it('finds RTU detail hits when search is not a building metadata match', () => {
    const hits = collectSearchHits(buildings, polygons, 'RTU- 01')
    expect(hits.some((h) => h.kind === 'rtu')).toBe(true)
  })

  it('opens building popup for address search', () => {
    const hits = collectSearchHits(buildings, polygons, '6975 Creditview')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.kind).toBe('building')
    expect(hits[0]!.address).toContain('6975 Creditview')
  })
})
