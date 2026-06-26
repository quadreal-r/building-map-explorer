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
  const [refreshEpoch, setRefreshEpoch] = useState(0)

  const refresh = useCallback(() => {
    setRefreshEpoch((epoch) => epoch + 1)
  }, [])

  useEffect(() => onRtuPicturesChanged(refresh), [refresh])

  useEffect(() => onUnsyncedChangesInvalidate(refresh), [refresh])

  useEffect(() => {
    let cancelled = false
    void collectUnsyncedChangesSummary().then((next) => {
      if (cancelled) return
      setLines(next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshEpoch, portfolioUnsaved, pendingGpsCount, stageRevision])

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
