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
  normalizePortfolioData,
} from '@/types/domain'
import { getJsonDataBaseUrl, usesRemoteJsonData } from '@/lib/jsonDataUrls'

import staticBuildings from '../../supabase/data/buildings.json'
import staticUtilities from '../../supabase/data/utilities.json'
import staticPolygons from '../../supabase/data/polygons.json'

export type { PortfolioData } from '@/types/domain'

const STORAGE_KEY = 'bme-portfolio'

declare global {
  interface Window {
    __BME_EMBEDDED_PORTFOLIO__?: PortfolioData
  }
}

function loadEmbeddedPortfolio(): PortfolioData | null {
  if (typeof window === 'undefined') return null
  const data = window.__BME_EMBEDDED_PORTFOLIO__
  return isValidStoredPortfolio(data) ? data : null
}

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
  return normalizePortfolioData({
    buildings: (staticBuildings as LegacyBuildingJson[]).map(normalizeLegacyBuilding),
    utilities: (staticUtilities as LegacyUtilityJson[]).map(normalizeLegacyUtility),
    polygons: (staticPolygons as LegacyPolygonJson[]).map(normalizeLegacyPolygon),
  })
}

async function loadRemotePortfolio(baseUrl: string): Promise<PortfolioData | null> {
  try {
    const fetchOpts: RequestInit = { cache: 'no-store' }
    const [buildingsRes, utilitiesRes, polygonsRes] = await Promise.all([
      fetch(`${baseUrl}buildings.json`, fetchOpts),
      fetch(`${baseUrl}utilities.json`, fetchOpts),
      fetch(`${baseUrl}polygons.json`, fetchOpts),
    ])
    if (!buildingsRes.ok || !utilitiesRes.ok || !polygonsRes.ok) return null

    const buildings = (await buildingsRes.json()) as LegacyBuildingJson[]
    const utilities = (await utilitiesRes.json()) as LegacyUtilityJson[]
    const polygons = (await polygonsRes.json()) as LegacyPolygonJson[]

    const portfolio = normalizePortfolioData({
      buildings: buildings.map(normalizeLegacyBuilding),
      utilities: utilities.map(normalizeLegacyUtility),
      polygons: polygons.map(normalizeLegacyPolygon),
    })
    return isValidStoredPortfolio(portfolio) ? portfolio : null
  } catch {
    return null
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
  const embedded = loadEmbeddedPortfolio()
  if (embedded) return normalizePortfolioData(embedded)

  const jsonBase = getJsonDataBaseUrl()
  if (jsonBase) {
    const remote = await loadRemotePortfolio(jsonBase)
    if (remote) return remote
  }

  const stored = loadStoredPortfolio()
  if (stored) return normalizePortfolioData(stored)

  return loadStaticPortfolio()
}

export function usePortfolioData() {
  const remoteJson = usesRemoteJsonData()
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: loadPortfolioData,
    staleTime: remoteJson ? 60_000 : Infinity,
    refetchOnWindowFocus: remoteJson,
  })
}

export function persistPortfolio(data: PortfolioData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export type { Building, Utility, Polygon }
