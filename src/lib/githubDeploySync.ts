/** One-click Settings sync: gist deploy bundle → GitHub Actions → R2 + commit + deploy. */

import { collectDeployBundleWithMeta } from '@/lib/deployBundle'
import { markRtuPicturesDeployed } from '@/lib/rtuPictures'
import type { PortfolioData } from '@/types/domain'

export const DEFAULT_GITHUB_REPO = 'quadreal-r/building-map-explorer'
export const SYNC_DEPLOY_WORKFLOW = 'sync-deploy.yml'
/** GitHub gist practical file size limit (leave headroom under 10 MB). */
export const MAX_GIST_BYTES = 9 * 1024 * 1024

const GITHUB_API = 'https://api.github.com'

export interface GitHubSyncOptions {
  token: string
  repo?: string
  onProgress?: (progress: GitHubSyncProgress) => void
}

export interface GitHubSyncProgress {
  message: string
  percent: number
}

export interface GitHubSyncResult {
  gistId: string
  workflowRunUrl: string | null
  picturesOmitted: boolean
  pictureCount: number
  pictureExportFailed: string[]
  pendingPictureCount: number
  exportedAt: string
  deployedFileNames: string[]
}

export const SYNC_COOLDOWN_MS = 5 * 60 * 1000

function reportProgress(
  onProgress: GitHubSyncOptions['onProgress'],
  message: string,
  percent: number,
): void {
  onProgress?.({ message, percent: Math.min(100, Math.max(0, percent)) })
}

interface WorkflowRun {
  created_at: string
  status: string
  conclusion: string | null
  html_url: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function githubErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string }
    if (parsed.message) return `GitHub API (${status}): ${parsed.message}`
  } catch {
    /* ignore */
  }
  return `GitHub API error (${status})`
}

async function githubFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(githubErrorMessage(res.status, body))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function resolveGitHubRepo(repo?: string): string {
  const trimmed = repo?.trim()
  return trimmed || DEFAULT_GITHUB_REPO
}

export async function createDeployBundleGist(
  leanJson: string,
  picturesJson: string | null,
  exportedAt: string,
  token: string,
): Promise<string> {
  const files: Record<string, { content: string }> = {
    'deploy-bundle.json': { content: leanJson },
  }
  if (picturesJson) {
    files['deploy-pictures.json'] = { content: picturesJson }
  }

  const gist = await githubFetch<{ id: string }>('/gists', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: `BME deploy bundle ${exportedAt}`,
      public: false,
      files,
    }),
  })
  return gist.id
}

export async function triggerSyncDeployWorkflow(
  gistId: string,
  rebuildManifest: boolean,
  token: string,
  repo: string,
): Promise<void> {
  await githubFetch(
    `/repos/${repo}/actions/workflows/${SYNC_DEPLOY_WORKFLOW}/dispatches`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          gist_id: gistId,
          rebuild_manifest: rebuildManifest ? 'true' : 'false',
        },
      }),
    },
  )
}

export async function waitForSyncWorkflowRun(
  startedAfterMs: number,
  token: string,
  repo: string,
  onProgress?: GitHubSyncOptions['onProgress'],
  timeoutMs = 10 * 60 * 1000,
  pollMs = 5000,
): Promise<{ status: string; html_url: string } | null> {
  const deadline = Date.now() + timeoutMs
  const waitStart = Date.now()
  while (Date.now() < deadline) {
    const elapsed = Date.now() - waitStart
    const waitPercent = 55 + Math.min(40, Math.floor((elapsed / timeoutMs) * 40))
    reportProgress(onProgress, 'Waiting for Cloudflare & GitHub workflow…', waitPercent)

    await sleep(pollMs)
    const data = await githubFetch<{ workflow_runs: WorkflowRun[] }>(
      `/repos/${repo}/actions/workflows/${SYNC_DEPLOY_WORKFLOW}/runs?per_page=10&event=workflow_dispatch`,
      token,
    )
    const run = data.workflow_runs.find(
      (item) => new Date(item.created_at).getTime() >= startedAfterMs - 10_000,
    )
    if (!run) continue
    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        return { status: 'success', html_url: run.html_url }
      }
      throw new Error(
        `Sync workflow failed (${run.conclusion ?? 'unknown'}). See ${run.html_url}`,
      )
    }
  }
  return null
}

/** Upload bundle via gist, run sync-deploy workflow, wait for completion. */
export async function syncDeployToGitHub(
  portfolio: PortfolioData,
  options: GitHubSyncOptions,
): Promise<GitHubSyncResult> {
  const token = options.token?.trim()
  if (!token) {
    throw new Error('GitHub token is required. Paste a personal access token in Settings.')
  }
  const repo = resolveGitHubRepo(options.repo)
  const { onProgress } = options

  reportProgress(onProgress, 'Collecting local data…', 8)
  const { bundle, pictureExport } = await collectDeployBundleWithMeta(portfolio)
  if (pictureExport.failedFileNames.length) {
    throw new Error(
      `${pictureExport.failedFileNames.length} local picture(s) could not be read for sync. Re-add them from the map and try again.`,
    )
  }

  reportProgress(onProgress, 'Preparing deploy bundle…', 18)
  const leanBundle = { ...bundle, pictures: [] as typeof bundle.pictures }
  let picturesJson = JSON.stringify(bundle.pictures)
  const leanJson = JSON.stringify(leanBundle)
  let picturesOmitted = false

  const gistBudget = MAX_GIST_BYTES
  if (leanJson.length + picturesJson.length > gistBudget) {
    if (bundle.pictures.length > 0) {
      picturesJson = ''
      picturesOmitted = true
    }
  }
  if (leanJson.length > gistBudget) {
    throw new Error(
      'Deploy bundle is too large for one-click sync. Use Export data for GitHub deploy and run apply-deploy-bundle locally.',
    )
  }

  reportProgress(onProgress, 'Uploading bundle to GitHub…', 32)
  const gistId = await createDeployBundleGist(
    leanJson,
    picturesOmitted ? null : picturesJson,
    bundle.exportedAt,
    token,
  )

  const transferredPictureCount = picturesOmitted ? 0 : bundle.pictures.length
  const rebuildManifest = picturesOmitted || transferredPictureCount === 0
  const startedAt = Date.now()
  reportProgress(onProgress, 'Starting Cloudflare & GitHub sync…', 48)
  await triggerSyncDeployWorkflow(gistId, rebuildManifest, token, repo)

  const run = await waitForSyncWorkflowRun(startedAt, token, repo, onProgress)
  reportProgress(onProgress, 'Upload complete', 100)

  if (!picturesOmitted && bundle.pictures.length > 0) {
    await markRtuPicturesDeployed(bundle.pictures.map((pic) => pic.fileName))
  }

  return {
    gistId,
    workflowRunUrl: run?.html_url ?? null,
    picturesOmitted,
    pictureCount: transferredPictureCount,
    pictureExportFailed: pictureExport.failedFileNames,
    pendingPictureCount: pictureExport.pendingCount,
    exportedAt: bundle.exportedAt,
    deployedFileNames: picturesOmitted ? [] : bundle.pictures.map((pic) => pic.fileName),
  }
}
