/** Fingerprints for portfolio / schedule / pricing included in Settings sync. */

import { STORAGE_KEYS } from '@/lib/storageKeys'
import type { RtuPricingRow } from '@/lib/rtuPricingSheet'
import type { PortfolioData, Utility } from '@/types/domain'
import { normalizePortfolioData } from '@/types/domain'

export interface DeployScheduleSnapshot {
  replacementYears: Record<string, string>
  notes: Record<string, string>
  sourceFile?: string | null
}

export interface DeployPricingSnapshot {
  version: string | null
  rows: RtuPricingRow[]
}

export function readScheduleSnapshotFromStorage(): DeployScheduleSnapshot | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEYS.rtuSchedule)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DeployScheduleSnapshot
    return {
      replacementYears: parsed.replacementYears ?? {},
      notes: parsed.notes ?? {},
      sourceFile: parsed.sourceFile ?? null,
    }
  } catch {
    return null
  }
}

export function readPricingSnapshotFromStorage(): DeployPricingSnapshot | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEYS.rtuPricing)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DeployPricingSnapshot & { sourceFile?: string | null }
    if (!parsed.rows?.length) return null
    return {
      version: parsed.version ?? null,
      rows: parsed.rows,
    }
  } catch {
    return null
  }
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

function utilityKey(utility: Utility): string {
  return `${utility.utility_type}\0${utility.name ?? ''}`
}

/** Stable JSON fingerprint of portfolio data written to Cloudflare buildings/utilities/polygons JSON. */
export function portfolioSyncFingerprint(portfolio: PortfolioData): string {
  const data = normalizePortfolioData(portfolio)
  const snapshot = {
    buildings: data.buildings
      .map((building) => ({
        park: building.park,
        address: building.address,
        bu: building.bu,
        lat: building.lat,
        lng: building.lng,
        sqft: building.sqft,
        cluster: building.cluster,
        manager: building.manager,
        notes: building.notes ?? null,
        sold: building.sold ?? false,
        rtus: (building.rtus ?? [])
          .map((rtu) => ({
            name: rtu.name,
            description: rtu.description ?? '',
            lat: rtu.lat,
            lng: rtu.lng,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.address.localeCompare(b.address)),
    utilities: data.utilities
      .map((utility) => ({
        utility_type: utility.utility_type,
        name: utility.name ?? '',
        description: utility.description ?? '',
        lat: utility.lat,
        lng: utility.lng,
      }))
      .sort((a, b) => utilityKey(a as Utility).localeCompare(utilityKey(b as Utility))),
    polygons: data.polygons
      .map((polygon) => ({
        name: polygon.name,
        description: polygon.description ?? '',
        color: polygon.color,
        paths: polygon.paths,
      }))
      .sort((a, b) => `${a.name}\0${a.description}`.localeCompare(`${b.name}\0${b.description}`)),
  }
  return JSON.stringify(snapshot)
}

export function localPortfolioDiffersFromRemote(
  local: PortfolioData,
  remote: PortfolioData,
): boolean {
  return portfolioSyncFingerprint(local) !== portfolioSyncFingerprint(remote)
}

export function scheduleSyncFingerprint(schedule: DeployScheduleSnapshot): string {
  return JSON.stringify({
    replacementYears: sortRecord(schedule.replacementYears ?? {}),
    notes: sortRecord(schedule.notes ?? {}),
  })
}

export function pricingSyncFingerprint(pricing: DeployPricingSnapshot): string {
  return JSON.stringify({
    version: pricing.version ?? null,
    rows: [...pricing.rows]
      .map((row) => ({ ...row }))
      .sort((a, b) => a.tonnageKey - b.tonnageKey),
  })
}

export {
  isScheduleDirty as isDeployScheduleDirtyLocally,
  isPricingDirty as isDeployPricingDirtyLocally,
  isDeployDataDirty as isDeployDataDirtyLocally,
} from '@/lib/syncState'
