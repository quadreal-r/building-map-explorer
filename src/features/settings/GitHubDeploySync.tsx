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
        Token needs <b>repo</b> and <b>workflow</b> scopes (Contents read/write). Add the same token as
        repo secret <code>BME_SYNC_PAT</code> (GitHub → Settings → Secrets → Actions).
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
          Live site and Cloudflare updates may take up to 2 minutes. Hard-refresh the map when the
          timer ends.
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
