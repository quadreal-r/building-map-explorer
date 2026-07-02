/** Single source of truth for sync dirty detection and baseline recording. */

import { countUnsyncedLocalHiddenRtuPictures } from '@/lib/hiddenRtuPictures'
import { countLocalDocumentsManifestEntries } from '@/lib/localDocumentsManifest'
import {
  portfolioSyncFingerprint,
  pricingSyncFingerprint,
  readPricingSnapshotFromStorage,
  readScheduleSnapshotFromStorage,
  scheduleSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import { exportHiddenRtuPicturesForDeploy } from '@/lib/hiddenRtuPictures'
import { loadRemoteSyncState, recordLocalSyncPush } from '@/lib/remoteSyncState'
import {
  countPendingPicturesNeedingCloudUpload,
  reconcilePendingDeployWithCloud,
} from '@/lib/rtuPictures'
import { fetchRemoteSyncMeta } from '@/lib/syncMeta'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import type { PortfolioData } from '@/types/domain'

function loadStoredPortfolioForDirtyCheck(): PortfolioData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.portfolio)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortfolioData
    if (!Array.isArray(parsed.buildings) || parsed.buildings.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export interface UnsyncedChangeLine {
  id: string
  label: string
  count?: number
}

export interface RecordSyncBaselineOptions {
  hiddenKeys?: string[]
  exportedAt?: string | null
  portfolioFingerprint?: string
  scheduleFingerprint?: string
  pricingFingerprint?: string
}

function portfolioUnsavedFlag(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(STORAGE_KEYS.portfolioUnsaved) === '1'
}

let preBaselineScheduleDirty = false
let preBaselinePricingDirty = false

/** Mark schedule/pricing dirty before the first Settings sync baseline exists. */
export function markSchedulePricingDirty(): void {
  preBaselineScheduleDirty = true
  preBaselinePricingDirty = true
}

export function markScheduleDirtyIfNoBaseline(): void {
  if (!loadRemoteSyncState().lastPushedScheduleFingerprint) {
    preBaselineScheduleDirty = true
  }
}

export function markPricingDirtyIfNoBaseline(): void {
  if (!loadRemoteSyncState().lastPushedPricingFingerprint) {
    preBaselinePricingDirty = true
  }
}

function clearPreBaselineDeployDirty(): void {
  preBaselineScheduleDirty = false
  preBaselinePricingDirty = false
}

export function setPortfolioDirtyLocally(dirty: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (dirty) localStorage.setItem(STORAGE_KEYS.portfolioUnsaved, '1')
  else localStorage.removeItem(STORAGE_KEYS.portfolioUnsaved)
}

/** Portfolio differs from the last successful Settings sync on this PC. */
export function isPortfolioDirty(portfolio?: PortfolioData | null): boolean {
  if (typeof localStorage === 'undefined') return false
  const local = portfolio ?? loadStoredPortfolioForDirtyCheck()
  if (!local) return portfolioUnsavedFlag()

  const { lastPushedPortfolioFingerprint } = loadRemoteSyncState()
  if (lastPushedPortfolioFingerprint) {
    return portfolioSyncFingerprint(local) !== lastPushedPortfolioFingerprint
  }
  return portfolioUnsavedFlag()
}

/** RTU replacement schedule differs from the last successful Settings sync on this PC. */
export function isScheduleDirty(): boolean {
  if (typeof localStorage === 'undefined') return false
  const schedule = readScheduleSnapshotFromStorage()
  if (!schedule) return preBaselineScheduleDirty

  const { lastPushedScheduleFingerprint } = loadRemoteSyncState()
  if (lastPushedScheduleFingerprint) {
    return scheduleSyncFingerprint(schedule) !== lastPushedScheduleFingerprint
  }
  return preBaselineScheduleDirty
}

/** RTU pricing differs from the last successful Settings sync on this PC. */
export function isPricingDirty(): boolean {
  if (typeof localStorage === 'undefined') return false
  const pricing = readPricingSnapshotFromStorage()
  if (!pricing) return preBaselinePricingDirty

  const { lastPushedPricingFingerprint } = loadRemoteSyncState()
  if (lastPushedPricingFingerprint) {
    return pricingSyncFingerprint(pricing) !== lastPushedPricingFingerprint
  }
  return preBaselinePricingDirty
}

export function isDeployDataDirty(): boolean {
  return isScheduleDirty() || isPricingDirty()
}

export function isHiddenPicturesDirty(): boolean {
  const { lastPushedHiddenKeys } = loadRemoteSyncState()
  return countUnsyncedLocalHiddenRtuPictures(lastPushedHiddenKeys) > 0
}

/** Mirror fingerprint truth into legacy portfolio localStorage dirty flag. */
export function syncLegacyDirtyFlags(): void {
  if (isPortfolioDirty()) setPortfolioDirtyLocally(true)
  else setPortfolioDirtyLocally(false)
}

/**
 * After load from cloud, discard, or successful Settings push,
 * align fingerprint baselines so unsynced warnings reflect real edits only.
 */
export async function recordSyncBaseline(
  portfolio: PortfolioData,
  options?: RecordSyncBaselineOptions,
): Promise<boolean> {
  let exportedAt = options?.exportedAt ?? null
  if (!exportedAt) {
    const meta = await fetchRemoteSyncMeta()
    exportedAt = meta?.exportedAt ?? null
  }
  if (!exportedAt) return false

  const scheduleSnapshot = readScheduleSnapshotFromStorage()
  const pricingSnapshot = readPricingSnapshotFromStorage()

  recordLocalSyncPush(exportedAt, {
    hiddenKeys: options?.hiddenKeys ?? exportHiddenRtuPicturesForDeploy(),
    portfolioFingerprint:
      options?.portfolioFingerprint ?? portfolioSyncFingerprint(portfolio),
    scheduleFingerprint:
      options?.scheduleFingerprint ??
      (scheduleSnapshot ? scheduleSyncFingerprint(scheduleSnapshot) : undefined),
    pricingFingerprint:
      options?.pricingFingerprint ??
      (pricingSnapshot ? pricingSyncFingerprint(pricingSnapshot) : undefined),
  })
  clearPreBaselineDeployDirty()
  syncLegacyDirtyFlags()
  return true
}

/** Local edits not yet uploaded via Settings → Sync to Cloudflare & GitHub. */
export async function collectUnsyncedLines(): Promise<UnsyncedChangeLine[]> {
  await reconcilePendingDeployWithCloud()

  const lines: UnsyncedChangeLine[] = []

  if (isPortfolioDirty()) {
    lines.push({
      id: 'portfolio',
      label: 'Portfolio database (buildings, RTUs, polygons, utilities)',
    })
  }

  if (isScheduleDirty()) {
    lines.push({
      id: 'schedule',
      label: 'RTU replacement schedule',
    })
  }

  if (isPricingDirty()) {
    lines.push({
      id: 'pricing',
      label: 'RTU pricing',
    })
  }

  const pendingGpsCount = usePendingRtuPictureStore.getState().items.length
  if (pendingGpsCount > 0) {
    lines.push({
      id: 'pending-gps',
      label: 'GPS photos on the map not yet assigned to an RTU',
      count: pendingGpsCount,
    })
  }

  const pendingDocumentLinks = countLocalDocumentsManifestEntries()
  if (pendingDocumentLinks > 0) {
    lines.push({
      id: 'pending-documents',
      label: 'RTU document links on this PC not yet in Cloudflare manifest',
      count: pendingDocumentLinks,
    })
  }

  const pendingCount = await countPendingPicturesNeedingCloudUpload()
  if (pendingCount > 0) {
    lines.push({
      id: 'pending-pictures',
      label: 'New RTU photos on this PC not yet in Cloudflare manifest',
      count: pendingCount,
    })
  }

  const hiddenCount = countUnsyncedLocalHiddenRtuPictures(
    loadRemoteSyncState().lastPushedHiddenKeys,
  )
  if (hiddenCount > 0) {
    lines.push({
      id: 'hidden-pictures',
      label: 'Hidden RTU pictures not yet synced to Cloudflare',
      count: hiddenCount,
    })
  }

  return lines
}
