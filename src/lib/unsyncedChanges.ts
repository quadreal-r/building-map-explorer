import { countUnsyncedLocalHiddenRtuPictures } from '@/lib/hiddenRtuPictures'
import { isDeployDataDirtyLocally } from '@/lib/deploySyncSnapshot'
import { isPortfolioDirtyLocally } from '@/hooks/usePortfolioData'
import { loadRemoteSyncState } from '@/lib/remoteSyncState'
import {
  countPendingPicturesNeedingCloudUpload,
  reconcilePendingDeployWithCloud,
} from '@/lib/rtuPictures'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { usePortfolioStore } from '@/stores/portfolioStore'

export interface UnsyncedChangeLine {
  id: string
  label: string
  count?: number
}

export function formatUnsyncedChangesMessage(lines: UnsyncedChangeLine[]): string {
  if (!lines.length) return ''
  return lines
    .map((line) => (line.count != null ? `${line.label} (${line.count})` : line.label))
    .join('; ')
}

/** Local edits not yet uploaded via Settings → Sync to Cloudflare & GitHub. */
export async function collectUnsyncedChangesSummary(): Promise<UnsyncedChangeLine[]> {
  await reconcilePendingDeployWithCloud()

  const lines: UnsyncedChangeLine[] = []

  if (usePortfolioStore.getState().unsaved || isPortfolioDirtyLocally()) {
    lines.push({
      id: 'portfolio',
      label: 'Portfolio database (buildings, RTUs, polygons, utilities)',
    })
  }

  if (isDeployDataDirtyLocally()) {
    lines.push({
      id: 'schedule-pricing',
      label: 'RTU schedule and pricing from Excel import',
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

  const pendingCount = await countPendingPicturesNeedingCloudUpload()
  if (pendingCount > 0) {
    lines.push({
      id: 'pending-pictures',
      label: 'New RTU photos on this PC not yet in Cloudflare manifest',
      count: pendingCount,
    })
  }

  const syncState = loadRemoteSyncState()
  const hiddenCount = countUnsyncedLocalHiddenRtuPictures(syncState.lastPushedHiddenKeys)
  if (hiddenCount > 0) {
    lines.push({
      id: 'hidden-pictures',
      label: 'Hidden RTU pictures not yet synced to Cloudflare',
      count: hiddenCount,
    })
  }

  return lines
}
