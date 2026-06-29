import { DEFAULT_GITHUB_REPO } from '@/lib/githubDeploySync'
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
      <p className={styles.hint}>
        Sync uploads map data and pictures to Cloudflare, commits portfolio JSON to GitHub, and
        triggers a GitHub Pages rebuild. <b>App UI changes</b> (e.g. removed buttons) must be on{' '}
        <code>main</code> first — run <code>npm run push-live</code> from the project folder, then
        sync. Token needs <b>repo</b> and <b>workflow</b> scopes. Add the same token as repo secret{' '}
        <code>BME_SYNC_PAT</code>.
      </p>
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
  return (
    <>
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
      {sync.completed && sync.cooldownSec > 0 ? (
        <p className={styles.hint}>
          Live site updates may take 5–10 minutes (data ~2 min, app rebuild longer). Hard-refresh when
          the timer ends. Download the sync status report for CDN picture status (missing from
          cloud), pictures added/removed, and build version.
        </p>
      ) : null}
    </>
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
