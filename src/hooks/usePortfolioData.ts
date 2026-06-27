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
import { repairPortfolioRtuNames } from '@/lib/rtuNameRepair'
import { migrateIndexedDbRtuKeys, migrateLegacyPictureFileNames } from '@/lib/rtuPictures'
import { getJsonDataBaseUrl, usesRemoteJsonData } from '@/lib/jsonDataUrls'
import { localPortfolioDiffersFromRemote } from '@/lib/deploySyncSnapshot'

import staticBuildings from '../../supabase/data/buildings.json'
import staticUtilities from '../../supabase/data/utilities.json'
import staticPolygons from '../../supabase/data/polygons.json'

export type { PortfolioData } from '@/types/domain'

const STORAGE_KEY = 'bme-portfolio'
const UNSAVED_KEY = 'bme-portfolio-unsaved'

export function isPortfolioDirtyLocally(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(UNSAVED_KEY) === '1'
}

export function setPortfolioDirtyLocally(dirty: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (dirty) localStorage.setItem(UNSAVED_KEY, '1')
  else localStorage.removeItem(UNSAVED_KEY)
}

/** True when this browser has portfolio edits not present in the cloud JSON snapshot. */
export function localPortfolioAheadOfRemote(
  local: PortfolioData,
  remote: PortfolioData,
): boolean {
  return localPortfolioDiffersFromRemote(local, remote)
}

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

export type PortfolioSnapshotSource = 'cloudflare' | 'bundled'

/** Cloudflare JSON when reachable, otherwise the bundled git snapshot. */
export async function loadFreshPortfolioSnapshot(): Promise<{
  portfolio: PortfolioData
  source: PortfolioSnapshotSource
}> {
  const baseUrl = getJsonDataBaseUrl()
  if (baseUrl) {
    const remote = await loadRemotePortfolio(baseUrl)
    if (remote) return { portfolio: remote, source: 'cloudflare' }
  }
  return { portfolio: loadStaticPortfolio(), source: 'bundled' }
}

export async function loadRemotePortfolio(baseUrl: string): Promise<PortfolioData | null> {
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

/** Latest portfolio saved in this browser (localStorage), when valid. */
export function loadStoredPortfolio(): PortfolioData | null {
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

  const stored = loadStoredPortfolio()
  const jsonBase = getJsonDataBaseUrl()

  if (jsonBase) {
    const remote = await loadRemotePortfolio(jsonBase)
    if (stored && remote) {
      const preferLocal =
        isPortfolioDirtyLocally() || localPortfolioAheadOfRemote(stored, remote)
      if (preferLocal) {
        if (!isPortfolioDirtyLocally()) setPortfolioDirtyLocally(true)
        const { portfolio } = await repairStoredPortfolioRtuNames(stored, { notify: true })
        return portfolio
      }
      return remote
    }
    if (remote) return remote
  }

  if (stored) {
    const { portfolio } = await repairStoredPortfolioRtuNames(stored, { notify: true })
    return portfolio
  }

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

export function persistPortfolio(data: PortfolioData, options?: { markSynced?: boolean }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  if (options?.markSynced) {
    setPortfolioDirtyLocally(false)
  } else {
    setPortfolioDirtyLocally(true)
  }
}

/** Shorten mistaken long RTU names and re-link IndexedDB pictures before sync. */
export async function repairStoredPortfolioRtuNames(
  portfolio: PortfolioData,
  options?: { persist?: boolean; notify?: boolean },
): Promise<{
  portfolio: PortfolioData
  renamed: number
  picturesMigrated: number
}> {
  const { portfolio: repaired, renames } = repairPortfolioRtuNames(normalizePortfolioData(portfolio))

  let picturesMigrated = 0
  if (renames.length) {
    picturesMigrated += await migrateIndexedDbRtuKeys(renames)
  }
  picturesMigrated += await migrateLegacyPictureFileNames()

  if (renames.length && options?.persist !== false) {
    persistPortfolio(repaired, { markSynced: !isPortfolioDirtyLocally() })
  }

  if (options?.notify && (renames.length || picturesMigrated)) {
    const { showToastSuccess } = await import('@/lib/toast')
    const sample = renames
      .slice(0, 2)
      .map((r) => r.newName)
      .join(', ')
    const more = renames.length > 2 ? ` +${renames.length - 2} more` : ''
    const pics = picturesMigrated
    const picNote = pics > 0 ? ` · ${pics} picture(s) re-linked` : ''
    const nameNote = renames.length ? `Fixed RTU name(s): ${sample}${more}` : 'Picture filenames fixed for cloud upload'
    showToastSuccess(`✓ ${nameNote}${picNote}. Use Sync to publish.`)
  }

  return { portfolio: repaired, renamed: renames.length, picturesMigrated }
}

export type { Building, Utility, Polygon }
