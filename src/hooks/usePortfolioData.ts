import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type {
  Building,
  LegacyBuildingJson,
  LegacyPolygonJson,
  LegacyUtilityJson,
  Polygon,
  Utility,
} from '@/types/domain'
import {
  normalizeLegacyBuilding,
  normalizeLegacyPolygon,
  normalizeLegacyUtility,
} from '@/types/domain'

import staticBuildings from '../../supabase/data/buildings.json'
import staticUtilities from '../../supabase/data/utilities.json'
import staticPolygons from '../../supabase/data/polygons.json'

import type { PortfolioData } from '@/types/domain'

export type { PortfolioData } from '@/types/domain'

function loadStaticPortfolio(): PortfolioData {
  return {
    buildings: (staticBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding),
    utilities: (staticUtilities as LegacyUtilityJson[]).map(normalizeLegacyUtility),
    polygons: (staticPolygons as LegacyPolygonJson[]).map(normalizeLegacyPolygon),
  }
}

async function loadPortfolioFromSupabase(): Promise<PortfolioData> {
  const [buildingsResult, rtusResult, tenantsResult, utilitiesResult, polygonsResult] =
    await Promise.all([
      supabase.from('buildings').select('*'),
      supabase.from('rtus').select('*'),
      supabase.from('tenants').select('*'),
      supabase.from('utilities').select('*'),
      supabase.from('polygons').select('*'),
    ])

  if (buildingsResult.error) throw buildingsResult.error
  if (rtusResult.error) throw rtusResult.error
  if (tenantsResult.error) throw tenantsResult.error
  if (utilitiesResult.error) throw utilitiesResult.error
  if (polygonsResult.error) throw polygonsResult.error

  const rtusByBuilding = new Map<number, Building['rtus']>()
  for (const row of rtusResult.data ?? []) {
    const buildingId = row.building_id as number
    const list = rtusByBuilding.get(buildingId) ?? []
    list.push({
      id: row.id as number,
      building_id: buildingId,
      name: row.name as string,
      description: (row.description as string | null) ?? '',
      lat: row.lat as number,
      lng: row.lng as number,
      model: row.model as string | null,
      serial: row.serial as string | null,
      make: row.make as string | null,
      install_date: row.install_date as string | null,
      install_year: row.install_year as number | null,
      heating_btu: row.heating_btu as string | null,
      cooling_tons: row.cooling_tons as number | null,
      suite: row.suite as string | null,
    })
    rtusByBuilding.set(buildingId, list)
  }

  const tenantsByBuilding = new Map<number, Building['tenants']>()
  for (const row of tenantsResult.data ?? []) {
    const buildingId = row.building_id as number
    const list = tenantsByBuilding.get(buildingId) ?? []
    list.push({
      id: row.id as number,
      building_id: buildingId,
      name: row.name as string,
      description: (row.description as string | null) ?? '',
      lat: row.lat as number,
      lng: row.lng as number,
    })
    tenantsByBuilding.set(buildingId, list)
  }

  const buildings: Building[] = (buildingsResult.data ?? []).map((row) => {
    const id = row.id as number
    return {
      id,
      park: row.park as string,
      address: row.address as string,
      bu: (row.bu as string | null) ?? '',
      lat: row.lat as number,
      lng: row.lng as number,
      sqft: (row.sqft as string | null) ?? '',
      cluster: (row.cluster as string | null) ?? '',
      manager: (row.manager as string | null) ?? '',
      notes: row.notes as string | null,
      rtus: rtusByBuilding.get(id) ?? [],
      tenants: tenantsByBuilding.get(id) ?? [],
    }
  })

  const utilities: Utility[] = (utilitiesResult.data ?? []).map((row) => ({
    id: row.id as number,
    utility_type: row.utility_type as Utility['utility_type'],
    name: row.name as string,
    description: (row.description as string | null) ?? '',
    lat: row.lat as number,
    lng: row.lng as number,
  }))

  const polygons: Polygon[] = (polygonsResult.data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
    description: (row.description as string | null) ?? '',
    color: row.color as string,
    paths: row.paths as Polygon['paths'],
  }))

  return { buildings, utilities, polygons }
}

export async function loadPortfolioData(): Promise<PortfolioData> {
  if (!isSupabaseConfigured) {
    return loadStaticPortfolio()
  }

  try {
    return await loadPortfolioFromSupabase()
  } catch {
    return loadStaticPortfolio()
  }
}

export function usePortfolioData() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: loadPortfolioData,
    staleTime: 5 * 60 * 1000,
  })
}
