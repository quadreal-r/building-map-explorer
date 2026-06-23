import { useMemo } from 'react'
import { useFilterStore } from '@/stores/filterStore'
import { applyPrimaryFilters, reconcileFilterDropdowns } from '@/lib/filters'
import type { Building, FilterState } from '@/types/domain'

export function useFilteredBuildings(buildings: Building[]) {
  const search = useFilterStore((state) => state.search)
  const park = useFilterStore((state) => state.park)
  const cluster = useFilterStore((state) => state.cluster)
  const manager = useFilterStore((state) => state.manager)
  const adv = useFilterStore((state) => state.adv)

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
    () => applyPrimaryFilters(buildings, reconcileFilterDropdowns(buildings, filters)),
    [buildings, filters],
  )

  return {
    filteredBuildings,
    listBuildings: filteredBuildings,
    allFiltered: filteredBuildings,
    count: filteredBuildings.length,
    mapCount: filteredBuildings.length,
    filters,
  }
}
