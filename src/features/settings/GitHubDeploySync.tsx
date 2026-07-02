import { DEFAULT_GITHUB_REPO } from '@/lib/githubDeploySync'
import { SettingsHoverHelp } from '@/features/settings/SettingsHoverHelp'
import styles from './SettingsModal.module.css'
import {
  useGitHubDeploySync,
  type GitHubDeploySyncProps,
} from './useGitHubDeploySync'

export type { GitHubDeploySyncProps } from './useGitHubDeploySync'

export function GitHubDeploySyncFields({
  sync,
  disabled,
}: {
  sync: ReturnType<typeof useGitHubDeploySync>
  disabled?: boolean
}) {
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
          value={sync.githubPat}
          onChange={(e) => sync.handlePatChange(e.target.value)}
          placeholder="ghp_… or github_pat_…"
          autoComplete="off"
          spellCheck={false}
          disabled={sync.syncing || disabled}
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
          value={sync.githubRepo}
          onChange={(e) => sync.handleRepoChange(e.target.value)}
          placeholder={DEFAULT_GITHUB_REPO}
          spellCheck={false}
          disabled={sync.syncing || disabled}
        />
      </div>
      <div className={styles.mgrRow}>
        <label className={styles.mgrLabel} htmlFor="github-remember-pat">
          <input
            id="github-remember-pat"
            type="checkbox"
            checked={sync.rememberGitHubPat}
            onChange={(e) => sync.handleRememberPatChange(e.target.checked)}
            disabled={sync.syncing || disabled}
          />{' '}
          Remember token
        </label>
      </div>
    </div>
  )
}

export function GitHubDeploySyncButton({
  sync,
  disabled,
}: {
  sync: ReturnType<typeof useGitHubDeploySync>
  disabled?: boolean
}) {
  const syncHelp = (
    <>
      Upload portfolio JSON, RTU schedule, pricing, and new pictures to Cloudflare, commit to GitHub,
      and trigger a Pages rebuild. Requires a GitHub token with <b>repo</b> and <b>workflow</b>{' '}
      scopes.
      {sync.completed && sync.cooldownSec > 0 ? (
        <>
          {' '}
          Live site updates may take 5–10 minutes (data ~2 min, app rebuild longer). Hard-refresh when
          the timer ends. Download the sync status report for CDN picture status, pictures
          added/removed, and build version.
        </>
      ) : null}
    </>
  )

  return (
    <SettingsHoverHelp content={syncHelp}>
      <button
        type="button"
        className={`${styles.syncDeployBtn} ${sync.syncing || sync.completed ? styles.syncDeployBtnWithProgress : ''}`}
        onClick={sync.handleSync}
        disabled={sync.syncing || disabled || !sync.githubPat.trim() || sync.cooldownSec > 0}
      >
        {sync.syncing || sync.completed ? (
          <span
            className={`${styles.syncDeployBtnFill} ${sync.completed ? styles.syncDeployBtnFillComplete : ''}`}
            style={{ width: `${sync.progressPct}%` }}
            aria-hidden="true"
          />
        ) : null}
        <span className={styles.syncDeployBtnText}>{sync.buttonLabel}</span>
      </button>
    </SettingsHoverHelp>
  )
}

export function GitHubDeploySync(props: GitHubDeploySyncProps) {
  const sync = useGitHubDeploySync(props)
  return (
    <>
      <GitHubDeploySyncFields sync={sync} disabled={props.disabled} />
      <GitHubDeploySyncButton sync={sync} disabled={props.disabled} />
    </>
  )
}
