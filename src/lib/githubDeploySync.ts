/** One-click Settings sync: staging branch → GitHub Actions → R2 + commit + deploy. */

import { collectDeployBundleLean } from '@/lib/deployBundle'
import { repairStoredPortfolioRtuNames } from '@/hooks/usePortfolioData'
import {
  encodeDeployPictureEntry,
  listPendingDeployPictureRows,
  markRtuPicturesDeployed,
} from '@/lib/rtuPictures'
import type { DeployPictureEntry } from '@/types/deployBundle'
import type { PortfolioData } from '@/types/domain'

export const DEFAULT_GITHUB_REPO = 'quadreal-r/building-map-explorer'
export const SYNC_DEPLOY_WORKFLOW = 'sync-deploy.yml'
export const SYNC_STAGING_BRANCH = 'bme-sync-staging'
export const SYNC_BUNDLE_PATH = 'sync/deploy-bundle.json'
export const SYNC_PICTURES_PATH = 'sync/deploy-pictures.json'
/** Numbered picture chunks: sync/deploy-pictures-0.json, sync/deploy-pictures-1.json, … */
export const SYNC_PICTURE_CHUNK_PREFIX = 'sync/deploy-pictures-'
/** Target size per picture chunk JSON (base64 photos). Single larger photos may exceed this. */
export const MAX_PICTURE_CHUNK_BYTES = 8 * 1024 * 1024
/** Hard limit for one picture chunk file (GitHub Contents API ~100 MB). */
export const MAX_SINGLE_PICTURE_CHUNK_BYTES = 95 * 1024 * 1024
/** Max bytes for lean JSON + pictures in one sync (GitHub Contents API limit is much higher). */
export const MAX_GIST_BYTES = 9 * 1024 * 1024
export const MAX_SYNC_BUNDLE_BYTES = MAX_GIST_BYTES

export function pictureChunkPath(index: number): string {
  return `${SYNC_PICTURE_CHUNK_PREFIX}${index}.json`
}

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
  stagingRef: string
  workflowRunUrl: string | null
  picturesOmitted: boolean
  pictureCount: number
  pictureChunkCount: number
  pictureExportFailed: string[]
  pendingPictureCount: number
  exportedAt: string
  deployedFileNames: string[]
}

export const SYNC_COOLDOWN_MS = 2 * 60 * 1000

/** Encode pending pictures one at a time until the JSON array fits the gist byte budget. */
export function jsonArraySizeAfterAddingEntry(currentSize: number, entryCount: number, entryJsonLength: number): number {
  if (entryCount === 0) return 2 + entryJsonLength
  return currentSize + 1 + entryJsonLength
}

/** Pack pending pictures into multiple JSON chunks so one sync can upload all photos. */
export async function collectDeployPictureChunks(
  maxChunkBytes: number,
  onProgress?: GitHubSyncOptions['onProgress'],
): Promise<{
  chunks: DeployPictureEntry[][]
  picturesOmitted: boolean
  failedFileNames: string[]
  pendingCount: number
}> {
  const { rows, failedFileNames, pendingCount } = await listPendingDeployPictureRows()
  if (!rows.length) {
    return { chunks: [], picturesOmitted: false, failedFileNames, pendingCount }
  }

  const chunks: DeployPictureEntry[][] = []
  let current: DeployPictureEntry[] = []
  let arrayJsonSize = 2
  let picturesOmitted = false
  const total = rows.length

  const flushCurrent = () => {
    if (!current.length) return
    chunks.push(current)
    current = []
    arrayJsonSize = 2
  }

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!
    reportProgress(
      onProgress,
      `Preparing pictures (${index + 1}/${total})…`,
      10 + Math.floor(((index + 1) / total) * 8),
    )

    try {
      const entry = await encodeDeployPictureEntry(row)
      const entryJsonLength = JSON.stringify(entry).length
      const soloSize = jsonArraySizeAfterAddingEntry(2, 0, entryJsonLength)
      if (soloSize > MAX_SINGLE_PICTURE_CHUNK_BYTES) {
        picturesOmitted = true
        failedFileNames.push(row.fileName)
        continue
      }

      const nextSize = jsonArraySizeAfterAddingEntry(arrayJsonSize, current.length, entryJsonLength)
      if (current.length > 0 && nextSize > maxChunkBytes) {
        flushCurrent()
      }

      const addSize = jsonArraySizeAfterAddingEntry(arrayJsonSize, current.length, entryJsonLength)
      arrayJsonSize = addSize
      current.push(entry)
    } catch {
      failedFileNames.push(row.fileName)
    }
  }

  flushCurrent()

  const encodedCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (encodedCount < rows.length - failedFileNames.length) {
    picturesOmitted = true
  }

  return { chunks, picturesOmitted, failedFileNames, pendingCount }
}

/** @deprecated Use collectDeployPictureChunks — kept for tests. */
export async function collectDeployPicturesWithinBudget(
  budgetBytes: number,
  onProgress?: GitHubSyncOptions['onProgress'],
): Promise<{
  pictures: DeployPictureEntry[]
  picturesOmitted: boolean
  failedFileNames: string[]
  pendingCount: number
}> {
  const { chunks, picturesOmitted, failedFileNames, pendingCount } =
    await collectDeployPictureChunks(budgetBytes, onProgress)
  return {
    pictures: chunks.flat(),
    picturesOmitted,
    failedFileNames,
    pendingCount,
  }
}

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

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function getDefaultBranchSha(token: string, repo: string): Promise<string> {
  const meta = await githubFetch<{ default_branch: string }>(`/repos/${repo}`, token)
  const ref = await githubFetch<{ object: { sha: string } }>(
    `/repos/${repo}/git/ref/heads/${meta.default_branch}`,
    token,
  )
  return ref.object.sha
}

async function ensureSyncStagingBranch(token: string, repo: string): Promise<void> {
  try {
    await githubFetch(`/repos/${repo}/git/ref/heads/${SYNC_STAGING_BRANCH}`, token)
    return
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('404')) throw error
  }
  const sha = await getDefaultBranchSha(token, repo)
  await githubFetch(`/repos/${repo}/git/refs`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${SYNC_STAGING_BRANCH}`,
      sha,
    }),
  })
}

async function getRepoFileSha(
  token: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const file = await githubFetch<{ sha: string }>(
      `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      token,
    )
    return file.sha
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) return undefined
    throw error
  }
}

async function putRepoFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
): Promise<void> {
  const sha = await getRepoFileSha(token, repo, path, branch)
  await githubFetch(`/repos/${repo}/contents/${path}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  })
}

async function deleteRepoFileIfExists(
  token: string,
  repo: string,
  path: string,
  message: string,
  branch: string,
): Promise<void> {
  const sha = await getRepoFileSha(token, repo, path, branch)
  if (!sha) return
  await githubFetch(`/repos/${repo}/contents/${path}`, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch }),
  })
}

/** Upload deploy bundle files to the sync staging branch (same repo token CI uses). */
export async function uploadSyncStagingBundle(
  leanJson: string,
  pictureChunkJsons: string[],
  exportedAt: string,
  token: string,
  repo: string,
): Promise<void> {
  await ensureSyncStagingBranch(token, repo)
  const message = `chore: sync staging bundle ${exportedAt}`
  await deleteRepoFileIfExists(
    token,
    repo,
    SYNC_PICTURES_PATH,
    `${message} (clear legacy pictures)`,
    SYNC_STAGING_BRANCH,
  )
  const staleChunkSlots = Math.max(pictureChunkJsons.length + 8, 32)
  for (let index = 0; index < staleChunkSlots; index++) {
    if (index < pictureChunkJsons.length) continue
    await deleteRepoFileIfExists(
      token,
      repo,
      pictureChunkPath(index),
      `${message} (clear stale picture chunk ${index})`,
      SYNC_STAGING_BRANCH,
    )
  }
  await putRepoFile(token, repo, SYNC_BUNDLE_PATH, leanJson, message, SYNC_STAGING_BRANCH)
  for (let index = 0; index < pictureChunkJsons.length; index++) {
    await putRepoFile(
      token,
      repo,
      pictureChunkPath(index),
      pictureChunkJsons[index]!,
      message,
      SYNC_STAGING_BRANCH,
    )
  }
}

export async function triggerSyncDeployWorkflow(
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
          staging_ref: SYNC_STAGING_BRANCH,
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

/** Upload bundle to staging branch, run sync-deploy workflow, wait for completion. */
export async function syncDeployToGitHub(
  portfolioIn: PortfolioData,
  options: GitHubSyncOptions,
): Promise<GitHubSyncResult> {
  const token = options.token?.trim()
  if (!token) {
    throw new Error('GitHub token is required. Paste a personal access token in Settings.')
  }
  const repo = resolveGitHubRepo(options.repo)
  const { onProgress } = options

  reportProgress(onProgress, 'Checking RTU names…', 4)
  const repaired = await repairStoredPortfolioRtuNames(portfolioIn, { notify: false })
  const portfolio = repaired.portfolio

  reportProgress(onProgress, 'Collecting local data…', 8)
  const leanCore = collectDeployBundleLean(portfolio)
  const leanBundle = { ...leanCore, pictures: [] as DeployPictureEntry[] }
  const leanJson = JSON.stringify(leanBundle)
  if (leanJson.length > MAX_GIST_BYTES) {
    throw new Error(
      'Deploy bundle is too large for one-click sync. Use Export data for GitHub deploy and run apply-deploy-bundle locally.',
    )
  }

  const pictureExport = await collectDeployPictureChunks(MAX_PICTURE_CHUNK_BYTES, onProgress)
  if (pictureExport.failedFileNames.length) {
    throw new Error(
      `${pictureExport.failedFileNames.length} local picture(s) could not be read for sync. Re-add them from the map and try again.`,
    )
  }

  const allPictures = pictureExport.chunks.flat()
  reportProgress(onProgress, 'Preparing deploy bundle…', 18)
  const bundle = { ...leanCore, pictures: allPictures }
  const picturesOmitted = pictureExport.picturesOmitted
  const pictureChunkJsons = pictureExport.chunks.map((chunk) => JSON.stringify(chunk))

  reportProgress(
    onProgress,
    pictureChunkJsons.length > 1
      ? `Uploading bundle (${pictureChunkJsons.length} picture batches)…`
      : 'Uploading bundle to GitHub…',
    32,
  )
  await uploadSyncStagingBundle(leanJson, pictureChunkJsons, bundle.exportedAt, token, repo)

  // apply-deploy-bundle already merges new pictures into manifest.json. Rebuilding from R2
  // replaces that manifest with lossy filename matching (duplicate cloud aliases, index
  // conflicts) and can drop ~3 of 4 photos per RTU from the cloud manifest count.
  const rebuildManifest = false
  const startedAt = Date.now()
  reportProgress(onProgress, 'Starting Cloudflare & GitHub sync…', 48)
  await triggerSyncDeployWorkflow(rebuildManifest, token, repo)

  const run = await waitForSyncWorkflowRun(startedAt, token, repo, onProgress)
  reportProgress(onProgress, 'Upload complete', 100)

  if (bundle.pictures.length > 0) {
    await markRtuPicturesDeployed(bundle.pictures.map((pic) => pic.fileName))
  }

  return {
    stagingRef: SYNC_STAGING_BRANCH,
    workflowRunUrl: run?.html_url ?? null,
    picturesOmitted,
    pictureCount: allPictures.length,
    pictureChunkCount: pictureChunkJsons.length,
    pictureExportFailed: pictureExport.failedFileNames,
    pendingPictureCount: pictureExport.pendingCount,
    exportedAt: bundle.exportedAt,
    deployedFileNames: allPictures.map((pic) => pic.fileName),
  }
}
