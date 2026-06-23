import { useQuery } from '@tanstack/react-query'
import type {
  Building,
  LegacyBuildingJson,
  LegacyPolygonJson,
  LegacyUtilityJson,
  Polygon,
  PortfolioData,
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

export type { PortfolioData } from '@/types/domain'

const STORAGE_KEY = 'bme-portfolio'

function loadStaticPortfolio(): PortfolioData {
  return {
    buildings: (staticBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding),
    utilities: (staticUtilities as LegacyUtilityJson[]).map(normalizeLegacyUtility),
    polygons: (staticPolygons as LegacyPolygonJson[]).map(normalizeLegacyPolygon),
  }
}

function loadStoredPortfolio(): PortfolioData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortfolioData
    if (!parsed.buildings?.length) return null
    return parsed
  } catch {
    return null
  }
}

export async function loadPortfolioData(): Promise<PortfolioData> {
  return loadStoredPortfolio() ?? loadStaticPortfolio()
}

export function usePortfolioData() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: loadPortfolioData,
    staleTime: Infinity,
  })
}

export function persistPortfolio(data: PortfolioData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export type { Building, Utility, Polygon }
