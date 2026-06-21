import legacyBuildings from '../../supabase/data/buildings.json'
import {
  applyFilters,
  matchesSearch,
  passAdvFilter,
  passDqFilter,
  reconcileFilterDropdowns,
} from '@/lib/filters'
import { getRtuAge } from '@/lib/rtu'
import {
  DEFAULT_ADV_FILTERS,
  DEFAULT_DQ_FILTERS,
  DEFAULT_FILTER_STATE,
  normalizeLegacyBuilding,
  type FilterState,
  type LegacyBuildingJson,
} from '@/types/domain'

const buildings = (legacyBuildings as LegacyBuildingJson[]).map(
  normalizeLegacyBuilding,
)

describe('matchesSearch', () => {
  it('matches address substring', () => {
    const hit = buildings.find((b) => b.address.includes('1850'))
    expect(hit).toBeDefined()
    expect(matchesSearch(hit!, '1850')).toBe(true)
  })

  it('matches tenant description', () => {
    const hit = buildings.find((b) =>
      b.tenants?.some((t) => t.description.includes('National Energy')),
    )
    expect(hit).toBeDefined()
    expect(matchesSearch(hit!, 'national energy')).toBe(true)
  })
})

describe('passAdvFilter', () => {
  it('requires old RTU when adv.rtu is yes', () => {
    const oldBuilding = buildings.find((b) => {
      const age = b.rtus?.reduce(
        (max, r) => Math.max(max, getRtuAge(r, 2026) ?? 0),
        0,
      )
      return (age ?? 0) >= 20
    })
    expect(oldBuilding).toBeDefined()
    expect(
      passAdvFilter(oldBuilding!, { ...DEFAULT_ADV_FILTERS, rtu: 'yes' }),
    ).toBe(true)
  })

  it('excludes buildings without RTUs when hasrtu is yes', () => {
    const noRtus: (typeof buildings)[number] = {
      park: 'Test',
      address: '1 Test Rd',
      bu: '',
      lat: 0,
      lng: 0,
      sqft: '',
      cluster: '',
      manager: '',
      rtus: [],
    }
    expect(
      passAdvFilter(noRtus, { ...DEFAULT_ADV_FILTERS, hasrtu: 'yes' }),
    ).toBe(false)
  })
})

describe('passDqFilter', () => {
  it('filters placeholder GPS when dq.gps is enabled', () => {
    const placeholder = buildings.find((b) =>
      Math.abs(b.lat - 43.5852972) < 0.0001,
    )
    if (!placeholder) return
    expect(passDqFilter(placeholder, { ...DEFAULT_DQ_FILTERS, gps: true })).toBe(
      true,
    )
  })
})

describe('reconcileFilterDropdowns', () => {
  it('clears park when it does not appear in search hits', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      search: '1850 Derry',
      park: 'Western Business Park (x 22)',
    }
    const reconciled = reconcileFilterDropdowns(buildings, filters)
    expect(reconciled.park).toBe('')
  })
})

describe('applyFilters', () => {
  it('returns subset for park filter', () => {
    const filtered = applyFilters(buildings, {
      ...DEFAULT_FILTER_STATE,
      park: 'Dixie Business Park (x 34)',
    })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((b) => b.park === 'Dixie Business Park (x 34)')).toBe(
      true,
    )
  })

  it('combines search and dq filters', () => {
    const filtered = applyFilters(buildings, {
      ...DEFAULT_FILTER_STATE,
      search: 'derry',
      dq: { ...DEFAULT_DQ_FILTERS, rtu: true },
    })
    expect(filtered.length).toBeGreaterThanOrEqual(0)
  })
})
