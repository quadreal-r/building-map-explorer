import {
  portfolioSyncFingerprint,
  pricingSyncFingerprint,
  readPricingSnapshotFromStorage,
  readScheduleSnapshotFromStorage,
  scheduleSyncFingerprint,
  syncDeployDirtyFlag,
} from '@/lib/deploySyncSnapshot'
import { exportHiddenRtuPicturesForDeploy } from '@/lib/hiddenRtuPictures'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import { fetchRemoteSyncMeta } from '@/lib/syncMeta'
import type { PortfolioData } from '@/types/domain'

export interface RecordLoadedSyncBaselineOptions {
  hiddenKeys?: string[]
  exportedAt?: string | null
}

/**
 * After loading portfolio/schedule/pricing from Cloudflare (or discard),
 * align fingerprint baselines so unsynced warnings reflect real edits only.
 */
export async function recordLoadedSyncBaseline(
  portfolio: PortfolioData,
  options?: RecordLoadedSyncBaselineOptions,
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
    portfolioFingerprint: portfolioSyncFingerprint(portfolio),
    scheduleFingerprint: scheduleSnapshot
      ? scheduleSyncFingerprint(scheduleSnapshot)
      : undefined,
    pricingFingerprint: pricingSnapshot
      ? pricingSyncFingerprint(pricingSnapshot)
      : undefined,
  })
  syncDeployDirtyFlag()
  return true
}
