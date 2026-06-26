import { useCallback, useEffect, useState } from 'react'
import {
  collectUnsyncedChangesSummary,
} from '@/lib/unsyncedChanges'
import { onUnsyncedChangesInvalidate } from '@/lib/unsyncedChangesEvents'
import type { UnsyncedChangeLine } from '@/lib/unsyncedChanges'
import { onRtuPicturesChanged } from '@/lib/rtuPictures'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { usePortfolioStore } from '@/stores/portfolioStore'

export function useUnsyncedChangesWarning() {
  const portfolioUnsaved = usePortfolioStore((state) => state.unsaved)
  const pendingGpsCount = usePendingRtuPictureStore((state) => state.items.length)
  const stageRevision = usePendingRtuPictureStore((state) => state.stageRevision)
  const [lines, setLines] = useState<UnsyncedChangeLine[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await collectUnsyncedChangesSummary()
    setLines(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, portfolioUnsaved, pendingGpsCount, stageRevision])

  useEffect(() => onRtuPicturesChanged(() => void refresh()), [refresh])

  useEffect(() => onUnsyncedChangesInvalidate(() => void refresh()), [refresh])

  const hasUnsynced = lines.length > 0

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsynced) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsynced])

  return { lines, loading, hasUnsynced, refresh }
}
