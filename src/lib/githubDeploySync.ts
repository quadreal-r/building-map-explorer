/** One-click Settings sync: gist deploy bundle → GitHub Actions → R2 + commit + deploy. */

import { collectDeployBundle, serializeDeployBundle } from '@/lib/deployBundle'
import type { PortfolioData } from '@/types/domain'

export const DEFAULT_GITHUB_REPO = 'quadreal-r/building-map-explorer'
export const SYNC_DEPLOY_WORKFLOW = 'sync-deploy.yml'
/** GitHub gist practical file size limit (leave headroom under 10 MB). */
export const MAX_GIST_BYTES = 9 * 1024 * 1024

const GITHUB_API = 'https://api.github.com'

export interface GitHubSyncOptions {
  token: string
  repo?: string
  onProgress?: (message: string) => void
}

export interface GitHubSyncResult {
  gistId: string
  workflowRunUrl: string | null
  picturesOmitted: boolean
  pictureCount: number
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
  json: string,
  exportedAt: string,
  token: string,
): Promise<string> {
  const gist = await githubFetch<{ id: string }>('/gists', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: `BME deploy bundle ${exportedAt}`,
      public: false,
      files: {
        'deploy-bundle.json': { content: json },
      },
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
  timeoutMs = 10 * 60 * 1000,
  pollMs = 5000,
): Promise<{ status: string; html_url: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
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

  onProgress?.('Collecting local data…')
  const bundle = await collectDeployBundle(portfolio)
  let { json, picturesOmitted } = serializeDeployBundle(bundle)

  if (json.length > MAX_GIST_BYTES && bundle.pictures.length > 0) {
    const lean = { ...bundle, pictures: [] }
    json = serializeDeployBundle(lean).json
    picturesOmitted = true
  }
  if (json.length > MAX_GIST_BYTES) {
    throw new Error(
      'Deploy bundle is too large for one-click sync. Use Export data for GitHub deploy and run apply-deploy-bundle locally.',
    )
  }

  onProgress?.('Uploading bundle to GitHub…')
  const gistId = await createDeployBundleGist(json, bundle.exportedAt, token)

  const rebuildManifest = picturesOmitted || bundle.pictures.length === 0
  const startedAt = Date.now()
  onProgress?.('Starting Cloudflare & GitHub sync…')
  await triggerSyncDeployWorkflow(gistId, rebuildManifest, token, repo)

  onProgress?.('Waiting for workflow to finish (may take a few minutes)…')
  const run = await waitForSyncWorkflowRun(startedAt, token, repo)

  return {
    gistId,
    workflowRunUrl: run?.html_url ?? null,
    picturesOmitted,
    pictureCount: bundle.pictures.length,
  }
}
