import {
  loadFreshPortfolioSnapshot,
  persistPortfolio,
  setPortfolioDirtyLocally,
  type PortfolioSnapshotSource,
} from '@/hooks/usePortfolioData'
import { clearLocalHiddenRtuPictures } from '@/lib/hiddenRtuPictures'
import { clearLocalDocumentsManifest } from '@/lib/localDocumentsManifest'
import { pullRemoteScheduleAndPricing } from '@/lib/pullRemoteUpdates'
import { recordLoadedSyncBaseline } from '@/lib/recordLoadedSyncBaseline'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import {
  clearLocalRtuPictureStorage,
  clearRtuPictureManifestCache,
  notifyRtuPicturesChanged,
} from '@/lib/rtuPictures'
import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import type { PortfolioData } from '@/types/domain'

export interface DiscardLocalUnsyncedResult {
  portfolio: PortfolioData
  source: PortfolioSnapshotSource
}

/** Revert this browser to a clean snapshot and drop local-only edits. */
export async function discardLocalUnsyncedChanges(): Promise<DiscardLocalUnsyncedResult> {
  const { portfolio, source } = await loadFreshPortfolioSnapshot()

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.portfolio)
  }
  setPortfolioDirtyLocally(false)
  persistPortfolio(portfolio, { markSynced: true })

  if (source === 'cloudflare') {
    await pullRemoteScheduleAndPricing()
    clearRtuPictureManifestCache()
    await recordLoadedSyncBaseline(portfolio, { hiddenKeys: [] })
  }

  usePendingRtuPictureStore.getState().clear()
  await clearLocalRtuPictureStorage()
  clearLocalHiddenRtuPictures()
  clearLocalDocumentsManifest()

  usePortfolioStore.getState().setPortfolio(portfolio, { markSaved: true })
  notifyRtuPicturesChanged()
  invalidateUnsyncedChanges()

  return { portfolio, source }
}
