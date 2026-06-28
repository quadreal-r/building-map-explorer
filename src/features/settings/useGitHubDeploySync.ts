import { useEffect, useState } from 'react'
import {
  SYNC_COOLDOWN_MS,
  syncDeployToGitHub,
  type GitHubSyncProgress,
} from '@/lib/githubDeploySync'
import { buildLocalSyncSummary } from '@/lib/portfolioStats'
import { recordLocalSyncHistoryEntry } from '@/lib/syncHistory'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import { exportHiddenRtuPicturesForDeploy } from '@/lib/hiddenRtuPictures'
import { invalidateUnsyncedChanges } from '@/lib/unsyncedChangesEvents'
import {
  clearRtuPictureManifestCache,
  loadRtuPictureManifest,
  reconcilePendingDeployWithCloud,
} from '@/lib/rtuPictures'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { loadStoredPortfolio, persistPortfolio } from '@/hooks/usePortfolioData'
import {
  clearDeployDataDirty,
  portfolioSyncFingerprint,
  readPricingSnapshotFromStorage,
  readScheduleSnapshotFromStorage,
  scheduleSyncFingerprint,
  pricingSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'
import type { SyncMetaSummary } from '@/types/syncMeta'

function countManifestPictures(entries: Record<string, string[]> | undefined): number {
  let total = 0
  for (const files of Object.values(entries ?? {})) {
    total += files.length
  }
  return total
}

function buildSyncSummaryForPush(
  portfolio: PortfolioData,
  manifestPictureCount: number,
  picturesUploaded: number,
  pictureChunkCount: number,
): SyncMetaSummary {
  const scheduleSnapshot = readScheduleSnapshotFromStorage()
  const pricingSnapshot = readPricingSnapshotFromStorage()
  const scheduleYears = scheduleSnapshot
    ? Object.keys(scheduleSnapshot.replacementYears ?? {}).length
    : 0
  const scheduleNotes = scheduleSnapshot ? Object.keys(scheduleSnapshot.notes ?? {}).length : 0
  const pricingRows = pricingSnapshot?.rows?.length ?? 0
  return {
    ...buildLocalSyncSummary(portfolio, scheduleYears, scheduleNotes, pricingRows),
    manifestPictureCount,
    picturesUploaded,
    ...(pictureChunkCount > 0 ? { pictureChunkCount } : {}),
  }
}

export interface GitHubDeploySyncProps {
  portfolio: PortfolioData
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}

function formatCooldown(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function useGitHubDeploySync({
  portfolio,
  onBusyChange,
}: GitHubDeploySyncProps) {
  const githubPat = useSettingsStore((s) => s.githubPat)
  const githubRepo = useSettingsStore((s) => s.githubRepo)
  const setGitHubPat = useSettingsStore((s) => s.setGitHubPat)
  const setGitHubRepo = useSettingsStore((s) => s.setGitHubRepo)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [syncing, setSyncing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [progress, setProgress] = useState<GitHubSyncProgress>({ message: '', percent: 0 })
  const [cooldownSec, setCooldownSec] = useState(0)

  useEffect(() => {
    onBusyChange?.(syncing)
  }, [onBusyChange, syncing])

  useEffect(() => {
    if (!completed || cooldownSec <= 0) return
    const timer = window.setInterval(() => {
      setCooldownSec((value) => {
        const next = Math.max(0, value - 1)
        if (next === 0) {
          setCompleted(false)
          setProgress({ message: '', percent: 0 })
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [completed, cooldownSec])

  const handlePatChange = (value: string) => {
    setGitHubPat(value)
    void saveSettings()
  }

  const handleRepoChange = (value: string) => {
    setGitHubRepo(value)
    void saveSettings()
  }

  const handleSync = () => {
    if (!githubPat.trim()) {
      showToastError('Paste a GitHub personal access token first.')
      return
    }
    if (cooldownSec > 0) return

    void (async () => {
      setSyncing(true)
      setCompleted(false)
      setProgress({ message: 'Starting...', percent: 0 })

      try {
        const result = await syncDeployToGitHub(portfolio, {
          token: githubPat,
          repo: githubRepo,
          onProgress: setProgress,
        })
        const parts = ['✓ Sync complete — portfolio JSON uploaded to Cloudflare and GitHub Pages will redeploy.']
        if (result.pictureCount > 0) {
          const batchNote =
            result.pictureChunkCount > 1
              ? ` (${result.pictureChunkCount} upload batches in one sync)`
              : ''
          parts.push(`${result.pictureCount} picture(s) uploaded to Cloudflare${batchNote}.`)
        }
        if (result.picturesOmitted && result.pendingPictureCount > result.pictureCount) {
          const skipped = result.pendingPictureCount - result.pictureCount
          parts.push(
            `${skipped} local picture(s) were too large to upload — resize them or use npm run upload-rtu-pictures-r2 locally.`,
          )
        } else if (result.pendingPictureCount > 0 && result.pictureCount === 0) {
          parts.push(`${result.pendingPictureCount} picture(s) were pending but none were uploaded.`)
        }
        if (result.workflowRunUrl) {
          parts.push(`Workflow: ${result.workflowRunUrl}`)
        }
        showToastSuccess(parts.join(' '))
        const syncedPortfolio = loadStoredPortfolio() ?? portfolio
        const scheduleSnapshot = readScheduleSnapshotFromStorage()
        const pricingSnapshot = readPricingSnapshotFromStorage()
        persistPortfolio(syncedPortfolio, { markSynced: true })
        clearDeployDataDirty()
        usePortfolioStore.getState().setPortfolio(syncedPortfolio, { markSaved: true })
        recordLocalSyncPush(result.exportedAt, {
          hiddenKeys: exportHiddenRtuPicturesForDeploy(),
          portfolioFingerprint: portfolioSyncFingerprint(syncedPortfolio),
          scheduleFingerprint: scheduleSnapshot
            ? scheduleSyncFingerprint(scheduleSnapshot)
            : undefined,
          pricingFingerprint: pricingSnapshot
            ? pricingSyncFingerprint(pricingSnapshot)
            : undefined,
        })
        const manifest = await loadRtuPictureManifest()
        recordLocalSyncHistoryEntry({
          exportedAt: result.exportedAt,
          summary: buildSyncSummaryForPush(
            syncedPortfolio,
            countManifestPictures(manifest.entries),
            result.pictureCount,
            result.pictureChunkCount,
          ),
        })
        clearRtuPictureManifestCache()
        void reconcilePendingDeployWithCloud().finally(() => {
          invalidateUnsyncedChanges()
        })
        setCompleted(true)
        setCooldownSec(Math.ceil(SYNC_COOLDOWN_MS / 1000))
        setProgress({ message: 'Completed upload', percent: 100 })
      } catch (error) {
        showToastError(error instanceof Error ? error.message : 'Sync failed')
        setCompleted(false)
        setProgress({ message: '', percent: 0 })
      } finally {
        setSyncing(false)
      }
    })()
  }

  const buttonLabel = (() => {
    if (syncing) return progress.message || 'Syncing...'
    if (completed && cooldownSec > 0) {
      return `Completed upload (wait ${formatCooldown(cooldownSec)} to activate)`
    }
    return 'Sync to Cloudflare & GitHub'
  })()

  const progressPct = syncing ? progress.percent : completed ? 100 : 0

  return {
    githubPat,
    githubRepo,
    syncing,
    completed,
    cooldownSec,
    buttonLabel,
    progressPct,
    handlePatChange,
    handleRepoChange,
    handleSync,
  }
}
