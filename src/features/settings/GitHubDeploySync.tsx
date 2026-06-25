import { useState } from 'react'
import { DEFAULT_GITHUB_REPO, syncDeployToGitHub } from '@/lib/githubDeploySync'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { useSettingsStore } from '@/stores/settingsStore'
import type { PortfolioData } from '@/types/domain'
import styles from './SettingsModal.module.css'

export interface GitHubDeploySyncProps {
  portfolio: PortfolioData
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
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
  const [progress, setProgress] = useState<string | null>(null)

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

    setSyncing(true)
    onBusyChange?.(true)
    setProgress('Starting…')

    void syncDeployToGitHub(portfolio, {
      token: githubPat,
      repo: githubRepo,
      onProgress: setProgress,
    })
      .then((result) => {
        const parts = ['✓ Sync complete — portfolio JSON uploaded to Cloudflare and GitHub Pages will redeploy.']
        if (result.picturesOmitted && result.pictureCount > 0) {
          parts.push(
            `${result.pictureCount} pictures were omitted from the bundle; manifest was rebuilt from Cloudflare R2.`,
          )
        } else if (result.pictureCount > 0) {
          parts.push(`${result.pictureCount} picture(s) uploaded.`)
        }
        if (result.workflowRunUrl) {
          parts.push(`Workflow: ${result.workflowRunUrl}`)
        }
        showToastSuccess(parts.join(' '))
      })
      .catch((error) => {
        showToastError(error instanceof Error ? error.message : 'Sync failed')
      })
      .finally(() => {
        setSyncing(false)
        onBusyChange?.(false)
        setProgress(null)
      })
  }

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
      <p className={styles.hint}>
        One-time setup: add the same token as repository secret{' '}
        <code className={styles.inlineCode}>BME_SYNC_PAT</code> (scopes: repo, workflow,
        gist). Every git push to main also uploads JSON to Cloudflare R2 for the live site.
      </p>
      <button
        type="button"
        className={styles.syncDeployBtn}
        onClick={handleSync}
        disabled={syncing || disabled || !githubPat.trim()}
      >
        {syncing ? (progress ?? 'Syncing…') : 'Sync to Cloudflare & GitHub'}
      </button>
    </div>
  )
}
