import { useEffect, useState } from 'react'
import {
  DEFAULT_GITHUB_REPO,
  SYNC_COOLDOWN_MS,
  syncDeployToGitHub,
  type GitHubSyncProgress,
} from '@/lib/githubDeploySync'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'
import styles from './SettingsModal.module.css'

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

export function GitHubDeploySync({
  portfolio,
  disabled,
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
    if (!completed || cooldownSec > 0) return
    setCompleted(false)
    setProgress({ message: '', percent: 0 })
  }, [completed, cooldownSec])

  useEffect(() => {
    if (!completed || cooldownSec <= 0) return
    const timer = window.setInterval(() => {
      setCooldownSec((value) => Math.max(0, value - 1))
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

    setSyncing(true)
    setCompleted(false)
    setProgress({ message: 'Starting…', percent: 0 })

    void syncDeployToGitHub(portfolio, {
      token: githubPat,
      repo: githubRepo,
      onProgress: setProgress,
    })
      .then((result) => {
        const parts = ['✓ Sync complete — portfolio JSON uploaded to Cloudflare and GitHub Pages will redeploy.']
        if (result.picturesOmitted && result.pendingPictureCount > 0) {
          parts.push(
            `${result.pendingPictureCount} local picture(s) were too large to include in the sync bundle — they were not uploaded to Cloudflare. Try fewer pictures per sync or export manually.`,
          )
        } else if (result.pictureCount > 0) {
          parts.push(`${result.pictureCount} picture(s) uploaded to Cloudflare.`)
        } else if (result.pendingPictureCount > 0) {
          parts.push(`${result.pendingPictureCount} picture(s) were pending but none were uploaded.`)
        }
        if (result.workflowRunUrl) {
          parts.push(`Workflow: ${result.workflowRunUrl}`)
        }
        showToastSuccess(parts.join(' '))
        recordLocalSyncPush(result.exportedAt)
        setCompleted(true)
        setCooldownSec(Math.ceil(SYNC_COOLDOWN_MS / 1000))
        setProgress({ message: 'Completed upload', percent: 100 })
      })
      .catch((error) => {
        showToastError(error instanceof Error ? error.message : 'Sync failed')
        setCompleted(false)
        setProgress({ message: '', percent: 0 })
      })
      .finally(() => {
        setSyncing(false)
      })
  }

  const buttonLabel = (() => {
    if (syncing) return progress.message || 'Syncing…'
    if (completed && cooldownSec > 0) {
      return `Completed upload (wait ${formatCooldown(cooldownSec)} to activate)`
    }
    return 'Sync to Cloudflare & GitHub'
  })()

  const progressPct = syncing ? progress.percent : completed ? 100 : 0

  return (
    <div className={styles.githubSync}>
      <div className={styles.mgrRow}>
        <label className={styles.mgrLabel} htmlFor="github-pat">
          GitHub token
        </label>
        <input
          id="github-pat"
          type="password"
          className={styles.mgrInput}
          value={githubPat}
          onChange={(e) => handlePatChange(e.target.value)}
          placeholder="ghp_… or github_pat_…"
          autoComplete="off"
          spellCheck={false}
          disabled={syncing || disabled}
        />
      </div>
      <div className={styles.mgrRow}>
        <label className={styles.mgrLabel} htmlFor="github-repo">
          Repository
        </label>
        <input
          id="github-repo"
          type="text"
          className={styles.mgrInput}
          value={githubRepo}
          onChange={(e) => handleRepoChange(e.target.value)}
          placeholder={DEFAULT_GITHUB_REPO}
          spellCheck={false}
          disabled={syncing || disabled}
        />
      </div>
      <button
        type="button"
        className={`${styles.syncDeployBtn} ${syncing || completed ? styles.syncDeployBtnWithProgress : ''}`}
        onClick={handleSync}
        disabled={syncing || disabled || !githubPat.trim() || cooldownSec > 0}
      >
        <span className={styles.syncDeployBtnInner}>
          {syncing || completed ? (
            <span
              className={`${styles.syncDeployBtnFill} ${completed ? styles.syncDeployBtnFillComplete : ''}`}
              style={{ width: `${progressPct}%` }}
              aria-hidden="true"
            />
          ) : null}
          <span className={styles.syncDeployBtnText}>{buttonLabel}</span>
        </span>
      </button>
      {completed && cooldownSec > 0 ? (
        <p className={styles.hint}>
          Live site and Cloudflare updates may take up to 5 minutes. Hard-refresh the map when the
          timer ends.
        </p>
      ) : null}
    </div>
  )
}
