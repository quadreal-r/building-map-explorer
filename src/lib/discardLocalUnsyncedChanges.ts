import {
  loadFreshPortfolioSnapshot,
  persistPortfolio,
  setPortfolioDirtyLocally,
  type PortfolioSnapshotSource,
} from '@/hooks/usePortfolioData'
import { clearDeployDataDirty } from '@/lib/deploySyncSnapshot'
import { clearLocalHiddenRtuPictures } from '@/lib/hiddenRtuPictures'
import { pullRemoteScheduleAndPricing } from '@/lib/pullRemoteUpdates'
import {
  clearLocalRtuPictureStorage,
  clearRtuPictureManifestCache,
  notifyRtuPicturesChanged,
} from '@/lib/rtuPictures'
import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import type { PortfolioData } from '@/types/domain'

const STORAGE_KEY = 'bme-portfolio'

export interface DiscardLocalUnsyncedResult {
  portfolio: PortfolioData
  source: PortfolioSnapshotSource
}

/** Revert this browser to a clean snapshot and drop local-only edits. */
export async function discardLocalUnsyncedChanges(): Promise<DiscardLocalUnsyncedResult> {
  const { portfolio, source } = await loadFreshPortfolioSnapshot()

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
  setPortfolioDirtyLocally(false)
  clearDeployDataDirty()
  persistPortfolio(portfolio, { markSynced: true })

  if (source === 'cloudflare') {
    await pullRemoteScheduleAndPricing()
    clearRtuPictureManifestCache()
  }

  usePendingRtuPictureStore.getState().clear()
  await clearLocalRtuPictureStorage()
  clearLocalHiddenRtuPictures()

  usePortfolioStore.getState().setPortfolio(portfolio, { markSaved: true })
  notifyRtuPicturesChanged()
  invalidateUnsyncedChanges()

  return { portfolio, source }
}
