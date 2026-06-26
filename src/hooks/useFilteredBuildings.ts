import { useMemo } from 'react'
import { useFilterStore } from '@/stores/filterStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { applyCostScopeFilters, applyPrimaryFilters, reconcileFilterDropdowns } from '@/lib/filters'
import { buildPolygonBuildingIndex } from '@/lib/polygonBuildings'
import type { Building, FilterState, Polygon } from '@/types/domain'

export function useFilteredBuildings(buildings: Building[], polygons: Polygon[] = []) {
  const search = useFilterStore((state) => state.search)
  const park = useFilterStore((state) => state.park)
  const cluster = useFilterStore((state) => state.cluster)
  const manager = useFilterStore((state) => state.manager)
  const adv = useFilterStore((state) => state.adv)
  const managerRenames = useSettingsStore((state) => state.managerRenames)

  const polygonIndex = useMemo(
    () => buildPolygonBuildingIndex(buildings, polygons),
    [buildings, polygons],
  )

  const filters: FilterState = useMemo(
    () => ({
      search,
      park,
      cluster,
      manager,
      adv,
      dq: { gps: false, rtu: false, vacant: false, ml: false },
    }),
    [search, park, cluster, manager, adv],
  )

  const filteredBuildings = useMemo(
    () =>
      applyPrimaryFilters(
        buildings,
        reconcileFilterDropdowns(buildings, filters, polygonIndex, managerRenames),
        polygonIndex,
        managerRenames,
      ),
    [buildings, filters, polygonIndex, managerRenames],
  )

  const costScopeBuildings = useMemo(
    () =>
      applyCostScopeFilters(
        buildings,
        reconcileFilterDropdowns(buildings, filters, polygonIndex, managerRenames),
        polygonIndex,
        managerRenames,
      ),
    [buildings, filters, polygonIndex, managerRenames],
  )

  return {
    filteredBuildings,
    costScopeBuildings,
    listBuildings: filteredBuildings,
    allFiltered: filteredBuildings,
    count: filteredBuildings.length,
    mapCount: filteredBuildings.length,
    filters,
    polygonIndex,
  }
}
