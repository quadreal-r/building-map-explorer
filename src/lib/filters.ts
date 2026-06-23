import { RTU_AGE_WARN } from '@/lib/constants'
import { hasPlaceholderGps, hasVacant, mlCount } from '@/lib/dataQuality'
import {
  type PolygonBuildingIndex,
  polygonsForBuilding,
} from '@/lib/polygonBuildings'
import { oldestRtuAge } from '@/lib/rtu'
import type {
  AdvFilterState,
  Building,
  DqFilterState,
  FilterState,
  Polygon,
} from '@/types/domain'

const ADV_RTU_AGE_THRESHOLD = 20

function normalizeSearch(search: string): string {
  return search.trim().toLowerCase()
}

/** Building-level search (address, BU, cluster, manager) — not RTU/tenant detail fields. */
export function matchesBuildingMetadata(building: Building, search: string): boolean {
  const q = normalizeSearch(search)
  if (!q) return true
  if (building.address.toLowerCase().includes(q)) return true
  if (building.bu?.toLowerCase().includes(q)) return true
  if (building.cluster?.toLowerCase().includes(q)) return true
  if (building.manager?.toLowerCase().includes(q)) return true
  return false
}

function buildingPolygons(
  index: PolygonBuildingIndex | undefined,
  building: Building,
): Polygon[] {
  return index ? polygonsForBuilding(index, building.address) : []
}

/** Search match across address, metadata, tenant polygons, and RTUs. */
export function matchesSearch(
  building: Building,
  search: string,
  polygonIndex?: PolygonBuildingIndex,
): boolean {
  const q = normalizeSearch(search)
  if (!q) return true

  if (building.address.toLowerCase().includes(q)) return true
  if (building.bu?.toLowerCase().includes(q)) return true
  if (building.cluster?.toLowerCase().includes(q)) return true
  if (building.manager?.toLowerCase().includes(q)) return true

  const tenantPolygons = buildingPolygons(polygonIndex, building)
  if (
    tenantPolygons.some(
      (polygon) =>
        polygon.description.toLowerCase().includes(q) ||
        polygon.name.toLowerCase().includes(q),
    )
  ) {
    return true
  }

  if (
    building.rtus?.some(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    )
  ) {
    return true
  }

  return false
}

/** Advanced filter predicates from the legacy `_passAdvFilter`. */
export function passAdvFilter(
  building: Building,
  adv: AdvFilterState,
  polygonIndex?: PolygonBuildingIndex,
): boolean {
  const tenantPolygons = buildingPolygons(polygonIndex, building)
  if (adv.vacant === 'yes' && !hasVacant(building, tenantPolygons)) return false
  if (adv.vacant === 'no' && hasVacant(building, tenantPolygons)) return false

  const oldest = oldestRtuAge(building)
  if (adv.rtu === 'yes' && oldest < ADV_RTU_AGE_THRESHOLD) return false
  if (adv.rtu === 'no' && oldest >= ADV_RTU_AGE_THRESHOLD) return false

  const hasRtus = Boolean(building.rtus && building.rtus.length > 0)
  if (adv.hasrtu === 'yes' && !hasRtus) return false
  if (adv.hasrtu === 'no' && hasRtus) return false

  const ml = mlCount(building)
  if (adv.ml === 'yes' && !ml) return false
  if (adv.ml === 'no' && ml) return false

  return true
}

/** Data-quality chip filters applied on top of primary filters. */
export function passDqFilter(
  building: Building,
  dq: DqFilterState,
  polygonIndex?: PolygonBuildingIndex,
): boolean {
  const tenantPolygons = buildingPolygons(polygonIndex, building)
  if (dq.gps && !hasPlaceholderGps(building)) return false
  if (dq.rtu && oldestRtuAge(building) < RTU_AGE_WARN) return false
  if (dq.vacant && !hasVacant(building, tenantPolygons)) return false
  if (dq.ml && !mlCount(building)) return false
  return true
}

/** When search is active, reset dropdown values that no longer match search hits. */
export function reconcileFilterDropdowns(
  buildings: Building[],
  filters: FilterState,
  polygonIndex?: PolygonBuildingIndex,
): FilterState {
  const search = normalizeSearch(filters.search)
  const next = { ...filters }

  if (search) {
    const searchMatches = buildings.filter((b) => matchesSearch(b, search, polygonIndex))
    if (next.park && !searchMatches.some((b) => b.park === next.park)) {
      next.park = ''
    }
    if (next.cluster && !searchMatches.some((b) => b.cluster === next.cluster)) {
      next.cluster = ''
    }
    if (next.manager && !searchMatches.some((b) => b.manager === next.manager)) {
      next.manager = ''
    }
  }

  if (next.park && !buildingsForFilterOptions(buildings, next, 'park').some((b) => b.park === next.park)) {
    next.park = ''
  }
  if (
    next.cluster &&
    !buildingsForFilterOptions(buildings, next, 'cluster').some((b) => b.cluster === next.cluster)
  ) {
    next.cluster = ''
  }
  if (
    next.manager &&
    !buildingsForFilterOptions(buildings, next, 'manager').some((b) => b.manager === next.manager)
  ) {
    next.manager = ''
  }

  return next
}

/** When a dropdown has exactly one option left, select it (unless the user just cleared that field). */
export function autoFillFilterDropdowns(
  buildings: Building[],
  filters: Pick<FilterState, 'search' | 'park' | 'cluster' | 'manager'>,
  skipFields: ReadonlySet<string> = new Set(),
  polygonIndex?: PolygonBuildingIndex,
): Pick<FilterState, 'search' | 'park' | 'cluster' | 'manager'> {
  const next = { ...filters }
  let changed = true

  while (changed) {
    changed = false
    const options = collectFilterOptions(buildings, next, polygonIndex)

    if (!next.park && !skipFields.has('park') && options.parks.length === 1) {
      next.park = options.parks[0]!
      changed = true
    }
    if (!next.cluster && !skipFields.has('cluster') && options.clusters.length === 1) {
      next.cluster = options.clusters[0]!
      changed = true
    }
    if (!next.manager && !skipFields.has('manager') && options.managers.length === 1) {
      next.manager = options.managers[0]!
      changed = true
    }
  }

  return next
}

/** Apply a dropdown change: reconcile invalid values, then auto-fill other fields. */
export function applyFilterSelection(
  buildings: Building[],
  filters: FilterState,
  patch: Partial<Pick<FilterState, 'park' | 'cluster' | 'manager'>>,
  polygonIndex?: PolygonBuildingIndex,
): Pick<FilterState, 'search' | 'park' | 'cluster' | 'manager'> {
  const expanded = { ...patch }
  if (patch.park === '') {
    expanded.manager = ''
    expanded.cluster = ''
  }
  if (patch.manager === '') {
    expanded.park = ''
    expanded.cluster = ''
  }

  const reconciled = reconcileFilterDropdowns(buildings, { ...filters, ...expanded }, polygonIndex)
  return autoFillFilterDropdowns(buildings, reconciled, new Set(Object.keys(expanded)), polygonIndex)
}

/** Primary filter pass (search, park, cluster, manager, advanced). */
export function applyPrimaryFilters(
  buildings: Building[],
  filters: FilterState,
  polygonIndex?: PolygonBuildingIndex,
): Building[] {
  const reconciled = reconcileFilterDropdowns(buildings, filters, polygonIndex)
  const search = normalizeSearch(reconciled.search)

  return buildings.filter((building) => {
    if (!matchesSearch(building, search, polygonIndex)) return false
    if (reconciled.park && building.park !== reconciled.park) return false
    if (reconciled.cluster && building.cluster !== reconciled.cluster) return false
    if (reconciled.manager && building.manager !== reconciled.manager) return false
    if (!passAdvFilter(building, reconciled.adv, polygonIndex)) return false
    return true
  })
}

/** Full filter pipeline including data-quality chips. */
export function applyFilters(
  buildings: Building[],
  filters: FilterState,
  polygonIndex?: PolygonBuildingIndex,
): Building[] {
  return applyPrimaryFilters(buildings, filters, polygonIndex).filter((building) =>
    passDqFilter(building, filters.dq, polygonIndex),
  )
}

/**
 * Buildings for RTU replacement cost scope.
 * When search matches any address/metadata, exclude buildings that only matched via RTU/tenant detail.
 */
export function applyCostScopeFilters(
  buildings: Building[],
  filters: FilterState,
  polygonIndex?: PolygonBuildingIndex,
): Building[] {
  const filtered = applyPrimaryFilters(buildings, filters, polygonIndex)
  const search = normalizeSearch(filters.search)
  if (!search) return filtered
  const metadataHits = filtered.filter((building) => matchesBuildingMetadata(building, search))
  return metadataHits.length > 0 ? metadataHits : filtered
}

/** Buildings eligible for a dropdown, excluding that dropdown's own filter. */
function buildingsForFilterOptions(
  buildings: Building[],
  filters: Pick<FilterState, 'search' | 'park' | 'cluster' | 'manager'>,
  exclude: 'park' | 'cluster' | 'manager',
  polygonIndex?: PolygonBuildingIndex,
): Building[] {
  const search = normalizeSearch(filters.search)
  return buildings.filter((building) => {
    if (!matchesSearch(building, search, polygonIndex)) return false
    if (exclude !== 'park' && filters.park && building.park !== filters.park) return false
    if (exclude !== 'cluster' && filters.cluster && building.cluster !== filters.cluster) {
      return false
    }
    if (exclude !== 'manager' && filters.manager && building.manager !== filters.manager) {
      return false
    }
    return true
  })
}

/** Unique sorted values for filter dropdown population (cascades with active filters). */
export function collectFilterOptions(
  buildings: Building[],
  filters: Pick<FilterState, 'search' | 'park' | 'cluster' | 'manager'> = {
    search: '',
    park: '',
    cluster: '',
    manager: '',
  },
  polygonIndex?: PolygonBuildingIndex,
): {
  parks: string[]
  clusters: string[]
  managers: string[]
} {
  const parks = [
    ...new Set(buildingsForFilterOptions(buildings, filters, 'park', polygonIndex).map((b) => b.park)),
  ].sort()
  const clusters = [
    ...new Set(
      buildingsForFilterOptions(buildings, filters, 'cluster', polygonIndex)
        .map((b) => b.cluster)
        .filter(Boolean),
    ),
  ].sort()
  const managers = [
    ...new Set(
      buildingsForFilterOptions(buildings, filters, 'manager', polygonIndex)
        .map((b) => b.manager)
        .filter(Boolean),
    ),
  ].sort()

  return { parks, clusters, managers }
}

/** True when search only matches RTU/tenant detail fields (not building metadata). */
export function isDetailOnlySearch(
  filtered: Building[],
  search: string,
): boolean {
  const q = normalizeSearch(search)
  if (!q) return false

  return !filtered.some(
    (b) =>
      b.address.toLowerCase().includes(q) ||
      Boolean(b.bu?.toLowerCase().includes(q)) ||
      Boolean(b.cluster?.toLowerCase().includes(q)) ||
      Boolean(b.manager?.toLowerCase().includes(q)),
  )
}
