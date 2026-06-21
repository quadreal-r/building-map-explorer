import { useEffect, useMemo } from 'react'
import { useFilterStore } from '@/stores/filterStore'
import {
  applyPrimaryFilters,
  passDqFilter,
  reconcileFilterDropdowns,
} from '@/lib/filters'
import type { Building, FilterState } from '@/types/domain'

export function useFilteredBuildings(buildings: Building[]) {
  const search = useFilterStore((state) => state.search)
  const park = useFilterStore((state) => state.park)
  const cluster = useFilterStore((state) => state.cluster)
  const manager = useFilterStore((state) => state.manager)
  const adv = useFilterStore((state) => state.adv)
  const dq = useFilterStore((state) => state.dq)
  const setPark = useFilterStore((state) => state.setPark)
  const setCluster = useFilterStore((state) => state.setCluster)
  const setManager = useFilterStore((state) => state.setManager)

  const filters: FilterState = useMemo(
    () => ({ search, park, cluster, manager, adv, dq }),
    [search, park, cluster, manager, adv, dq],
  )

  const reconciled = useMemo(
    () => reconcileFilterDropdowns(buildings, filters),
    [buildings, filters],
  )

  useEffect(() => {
    if (reconciled.park !== park) setPark(reconciled.park)
    if (reconciled.cluster !== cluster) setCluster(reconciled.cluster)
    if (reconciled.manager !== manager) setManager(reconciled.manager)
  }, [reconciled, park, cluster, manager, setPark, setCluster, setManager])

  const filteredBuildings = useMemo(
    () => applyPrimaryFilters(buildings, reconciled),
    [buildings, reconciled],
  )

  const listBuildings = useMemo(
    () => filteredBuildings.filter((building) => passDqFilter(building, dq)),
    [filteredBuildings, dq],
  )

  const allFiltered = useMemo(
    () => filteredBuildings.filter((building) => passDqFilter(building, dq)),
    [filteredBuildings, dq],
  )

  return {
    filteredBuildings,
    listBuildings,
    allFiltered,
    count: listBuildings.length,
    mapCount: filteredBuildings.length,
    filters: reconciled,
  }
}
