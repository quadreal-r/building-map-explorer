import { useCallback, useEffect, useState } from 'react'
import {
  buildPictureCountSummary,
  type PictureCountSummary,
} from '@/lib/rtuPictureCountSummary'
import { getRtuPictureCountMap, onRtuPicturesChanged } from '@/lib/rtuPictures'
import type { Building } from '@/types/domain'

export function useRtuPictureCountSummary(buildings: Building[]) {
  const [summary, setSummary] = useState<PictureCountSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshEpoch, setRefreshEpoch] = useState(0)

  const refresh = useCallback(() => {
    setRefreshEpoch((epoch) => epoch + 1)
  }, [])

  useEffect(() => onRtuPicturesChanged(refresh), [refresh])

  useEffect(() => {
    let cancelled = false
    void getRtuPictureCountMap().then((counts) => {
      if (cancelled) return
      setSummary(buildPictureCountSummary(buildings, counts))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [buildings, refreshEpoch])

  return { summary, loading, refresh }
}
