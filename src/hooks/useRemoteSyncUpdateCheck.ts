import { useCallback, useEffect, useRef, useState } from 'react'
import { usesRemoteJsonData } from '@/lib/jsonDataUrls'
import { buildLocalSyncSummary } from '@/lib/portfolioStats'
import { pullRemoteUpdatesToLocal } from '@/lib/pullRemoteUpdates'
import {
  acknowledgeRemoteSync,
  initializeRemoteSyncBaseline,
  loadRemoteSyncState,
  shouldPromptForRemoteSync,
} from '@/lib/remoteSyncState'
import { describeSyncSource, fetchRemoteSyncMeta, formatSyncTimestamp } from '@/lib/syncMeta'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import type { PortfolioData } from '@/types/domain'
import type { SyncMeta } from '@/types/syncMeta'

const CHECK_INTERVAL_MS = 60_000

export interface RemoteSyncUpdateState {
  open: boolean
  meta: SyncMeta | null
  localSummary: ReturnType<typeof buildLocalSyncSummary> | null
  loading: boolean
  dismiss: () => void
  loadUpdates: () => Promise<PortfolioData | null>
}

export function useRemoteSyncUpdateCheck(
  portfolio: PortfolioData,
  onPortfolioLoaded: (data: PortfolioData) => void,
): RemoteSyncUpdateState {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<SyncMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const checkingRef = useRef(false)

  const scheduleYears = useRtuScheduleStore((s) => Object.keys(s.replacementYears).length)
  const scheduleNotes = useRtuScheduleStore((s) => Object.keys(s.notes).length)
  const pricingRows = useRtuPricingStore((s) => s.rows.length)

  const localSummary = buildLocalSyncSummary(
    portfolio,
    scheduleYears,
    scheduleNotes,
    pricingRows,
  )

  const checkForUpdates = useCallback(async () => {
    if (!usesRemoteJsonData() || checkingRef.current) return
    checkingRef.current = true
    try {
      const remote = await fetchRemoteSyncMeta()
      if (!remote) return

      const state = loadRemoteSyncState()
      if (!state.initialized) {
        initializeRemoteSyncBaseline(remote.exportedAt)
        return
      }

      if (!shouldPromptForRemoteSync(remote.exportedAt, state)) return

      setMeta(remote)
      setOpen(true)
    } finally {
      checkingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!usesRemoteJsonData()) return
    void checkForUpdates()

    const onFocus = () => {
      void checkForUpdates()
    }
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => {
      void checkForUpdates()
    }, CHECK_INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [checkForUpdates])

  const dismiss = useCallback(() => {
    if (meta) acknowledgeRemoteSync(meta.exportedAt)
    setOpen(false)
  }, [meta])

  const loadUpdates = useCallback(async () => {
    if (!meta) return null
    setLoading(true)
    try {
      const next = await pullRemoteUpdatesToLocal()
      onPortfolioLoaded(next)
      acknowledgeRemoteSync(meta.exportedAt)
      setOpen(false)
      return next
    } finally {
      setLoading(false)
    }
  }, [meta, onPortfolioLoaded])

  return {
    open,
    meta,
    localSummary,
    loading,
    dismiss,
    loadUpdates,
  }
}

export { describeSyncSource, formatSyncTimestamp }
