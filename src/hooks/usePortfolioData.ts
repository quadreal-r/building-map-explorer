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

export function isValidStoredPortfolio(data: unknown): data is PortfolioData {
  if (!data || typeof data !== 'object') return false
  const portfolio = data as PortfolioData
  if (!Array.isArray(portfolio.buildings)) return false
  if (!Array.isArray(portfolio.utilities)) return false
  if (!Array.isArray(portfolio.polygons)) return false
  if (portfolio.buildings.length === 0) return false
  return portfolio.buildings.every(
    (building) =>
      typeof building.address === 'string' &&
      typeof building.lat === 'number' &&
      typeof building.lng === 'number',
  )
}

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
    const parsed: unknown = JSON.parse(raw)
    if (!isValidStoredPortfolio(parsed)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
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
