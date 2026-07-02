/** One-click Settings sync: staging branch → GitHub Actions → R2 + commit + deploy. */

import { collectDeployBundleLean } from '@/lib/deployBundle'
import { loadStoredPortfolio, repairStoredPortfolioRtuNames } from '@/hooks/usePortfolioData'
import {
  encodeDeployPictureEntry,
  listPendingDeployPictureRows,
  markRtuPicturesDeployed,
} from '@/lib/rtuPictures'
import type { DeployDocumentEntry, DeployPictureEntry } from '@/types/deployBundle'
import type { PortfolioData } from '@/types/domain'

export const DEFAULT_GITHUB_REPO = 'quadreal-r/building-map-explorer'
export const SYNC_DEPLOY_WORKFLOW = 'sync-deploy.yml'
export const PAGES_DEPLOY_WORKFLOW = 'deploy.yml'
export const SYNC_STAGING_BRANCH = 'bme-sync-staging'
export const SYNC_BUNDLE_PATH = 'sync/deploy-bundle.json'
export const SYNC_PICTURES_PATH = 'sync/deploy-pictures.json'
/** Numbered picture chunks: sync/deploy-pictures-0.json, sync/deploy-pictures-1.json, … */
export const SYNC_PICTURE_CHUNK_PREFIX = 'sync/deploy-pictures-'
export const SYNC_DOCUMENT_CHUNK_PREFIX = 'sync/deploy-documents-'
/** Target size per picture chunk JSON (base64 photos). Single larger photos may exceed this. */
export const MAX_PICTURE_CHUNK_BYTES = 8 * 1024 * 1024
/** Target size per document chunk JSON (base64 files). */
export const MAX_DOCUMENT_CHUNK_BYTES = 8 * 1024 * 1024
/** Hard limit for one picture chunk file (GitHub Contents API ~100 MB). */
export const MAX_SINGLE_PICTURE_CHUNK_BYTES = 95 * 1024 * 1024
/** Max bytes for lean JSON + pictures in one sync (GitHub Contents API limit is much higher). */
export const MAX_GIST_BYTES = 9 * 1024 * 1024
export const MAX_SYNC_BUNDLE_BYTES = MAX_GIST_BYTES

export function pictureChunkPath(index: number): string {
  return `${SYNC_PICTURE_CHUNK_PREFIX}${index}.json`
}

export function documentChunkPath(index: number): string {
  return `${SYNC_DOCUMENT_CHUNK_PREFIX}${index}.json`
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
  pagesDeployTriggered: boolean
  picturesOmitted: boolean
  pictureCount: number
  pictureChunkCount: number
  pictureExportFailed: string[]
  documentCount: number
  documentChunkCount: number
  documentExportFailed: string[]
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

/** Pack pending RTU documents into JSON chunks for Settings sync. */
export async function collectDeployDocumentChunks(
  maxChunkBytes: number,
  onProgress?: GitHubSyncOptions['onProgress'],
): Promise<{
  chunks: DeployDocumentEntry[][]
  documentsOmitted: boolean
  failedFileNames: string[]
  pendingCount: number
}> {
  const { exportPendingDocumentsForDeploy } = await import('@/lib/rtuDocumentDeploy')
  const { documents, failedFileNames, pendingCount } = await exportPendingDocumentsForDeploy()
  if (!documents.length) {
    return { chunks: [], documentsOmitted: false, failedFileNames, pendingCount }
  }

  const chunks: DeployDocumentEntry[][] = []
  let current: DeployDocumentEntry[] = []
  let arrayJsonSize = 2
  let documentsOmitted = false
  const total = documents.length

  const flushCurrent = () => {
    if (!current.length) return
    chunks.push(current)
    current = []
    arrayJsonSize = 2
  }

  for (let index = 0; index < documents.length; index++) {
    const entry = documents[index]!
    reportProgress(
      onProgress,
      `Preparing documents (${index + 1}/${total})…`,
      18 + Math.floor(((index + 1) / total) * 4),
    )
    const entryJsonLength = JSON.stringify(entry).length
    const soloSize = jsonArraySizeAfterAddingEntry(2, 0, entryJsonLength)
    if (soloSize > MAX_SINGLE_PICTURE_CHUNK_BYTES) {
      documentsOmitted = true
      failedFileNames.push(entry.fileName)
      continue
    }
    const nextSize = jsonArraySizeAfterAddingEntry(arrayJsonSize, current.length, entryJsonLength)
    if (current.length > 0 && nextSize > maxChunkBytes) {
      flushCurrent()
    }
    arrayJsonSize = jsonArraySizeAfterAddingEntry(arrayJsonSize, current.length, entryJsonLength)
    current.push(entry)
  }

  flushCurrent()
  const encodedCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (encodedCount < documents.length - failedFileNames.length) {
    documentsOmitted = true
  }

  return { chunks, documentsOmitted, failedFileNames, pendingCount }
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
  documentChunkJsons: string[],
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
  const staleChunkCleanupLimit = Math.max(pictureChunkJsons.length + 16, 128)
  for (let index = pictureChunkJsons.length; index < staleChunkCleanupLimit; index++) {
    const sha = await getRepoFileSha(token, repo, pictureChunkPath(index), SYNC_STAGING_BRANCH)
    if (!sha) break
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

  const staleDocumentCleanupLimit = Math.max(documentChunkJsons.length + 8, 32)
  for (let index = documentChunkJsons.length; index < staleDocumentCleanupLimit; index++) {
    const sha = await getRepoFileSha(token, repo, documentChunkPath(index), SYNC_STAGING_BRANCH)
    if (!sha) break
    await deleteRepoFileIfExists(
      token,
      repo,
      documentChunkPath(index),
      `${message} (clear stale document chunk ${index})`,
      SYNC_STAGING_BRANCH,
    )
  }
  for (let index = 0; index < documentChunkJsons.length; index++) {
    await putRepoFile(
      token,
      repo,
      documentChunkPath(index),
      documentChunkJsons[index]!,
      message,
      SYNC_STAGING_BRANCH,
    )
  }
}

/** Remove ephemeral sync staging branch after a successful workflow run. */
export async function deleteSyncStagingBranch(token: string, repo: string): Promise<void> {
  try {
    await githubFetch(`/repos/${repo}/git/refs/heads/${SYNC_STAGING_BRANCH}`, token, {
      method: 'DELETE',
    })
  } catch {
    /* branch may already be deleted */
  }
}

export async function triggerSyncDeployWorkflow(token: string, repo: string): Promise<void> {
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
        },
      }),
    },
  )
}

/** Rebuild GitHub Pages from latest main (app UI + bundled assets). */
export async function triggerPagesDeployWorkflow(token: string, repo: string): Promise<void> {
  await githubFetch(
    `/repos/${repo}/actions/workflows/${PAGES_DEPLOY_WORKFLOW}/dispatches`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
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
  const portfolioForSync = loadStoredPortfolio() ?? portfolioIn
  const repaired = await repairStoredPortfolioRtuNames(portfolioForSync, { notify: false })
  const portfolio = repaired.portfolio

  reportProgress(onProgress, 'Collecting local data…', 8)
  const leanCore = collectDeployBundleLean(portfolio)
  const leanBundleForSize = { ...leanCore, pictures: [] as DeployPictureEntry[] }
  const leanJsonForSize = JSON.stringify(leanBundleForSize)
  if (leanJsonForSize.length > MAX_GIST_BYTES) {
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

  const documentExport = await collectDeployDocumentChunks(MAX_DOCUMENT_CHUNK_BYTES, onProgress)
  if (documentExport.failedFileNames.length) {
    throw new Error(
      `${documentExport.failedFileNames.length} local document(s) could not be read for sync.`,
    )
  }

  const allPictures = pictureExport.chunks.flat()
  const pictureChunkJsons = pictureExport.chunks.map((chunk) => JSON.stringify(chunk))
  const allDocuments = documentExport.chunks.flat()
  const documentChunkJsons = documentExport.chunks.map((chunk) => JSON.stringify(chunk))
  reportProgress(onProgress, 'Preparing deploy bundle…', 22)
  const leanJson = JSON.stringify({
    ...leanCore,
    pictures: [] as DeployPictureEntry[],
    documents: [] as DeployDocumentEntry[],
    pictureChunkCount: pictureChunkJsons.length,
    documentChunkCount: documentChunkJsons.length,
  })
  const bundle = {
    ...leanCore,
    pictures: allPictures,
    documents: allDocuments,
    pictureChunkCount: pictureChunkJsons.length,
    documentChunkCount: documentChunkJsons.length,
  }
  const picturesOmitted = pictureExport.picturesOmitted

  const batchCount = pictureChunkJsons.length + documentChunkJsons.length
  reportProgress(
    onProgress,
    batchCount > 1 ? `Uploading bundle (${batchCount} file batches)…` : 'Uploading bundle to GitHub…',
    32,
  )
  await uploadSyncStagingBundle(
    leanJson,
    pictureChunkJsons,
    documentChunkJsons,
    bundle.exportedAt,
    token,
    repo,
  )

  const startedAt = Date.now()
  reportProgress(onProgress, 'Starting Cloudflare & GitHub sync…', 48)
  await triggerSyncDeployWorkflow(token, repo)

  const run = await waitForSyncWorkflowRun(startedAt, token, repo, onProgress)
  if (run?.status === 'success') {
    await deleteSyncStagingBranch(token, repo)
  }

  // Optional: user PAT can dispatch deploy.yml (CI push to main already triggers it when data commits).
  let pagesDeployTriggered = false
  try {
    reportProgress(onProgress, 'Requesting GitHub Pages rebuild…', 96)
    await triggerPagesDeployWorkflow(token, repo)
    pagesDeployTriggered = true
  } catch {
    /* non-fatal — sync-deploy push to main may have started deploy.yml already */
  }

  reportProgress(onProgress, 'Upload complete', 100)

  if (bundle.pictures.length > 0) {
    await markRtuPicturesDeployed(bundle.pictures.map((pic) => pic.fileName))
  }
  if (allDocuments.length > 0) {
    const { markRtuDocumentsDeployed } = await import('@/lib/rtuDocumentDeploy')
    await markRtuDocumentsDeployed(allDocuments.map((doc) => doc.fileName))
  }
  if (leanCore.documentsManifest) {
    const { clearLocalDocumentsManifest } = await import('@/lib/localDocumentsManifest')
    clearLocalDocumentsManifest()
  }

  return {
    stagingRef: SYNC_STAGING_BRANCH,
    workflowRunUrl: run?.html_url ?? null,
    pagesDeployTriggered,
    picturesOmitted,
    pictureCount: allPictures.length,
    pictureChunkCount: pictureChunkJsons.length,
    pictureExportFailed: pictureExport.failedFileNames,
    documentCount: allDocuments.length,
    documentChunkCount: documentChunkJsons.length,
    documentExportFailed: documentExport.failedFileNames,
    pendingPictureCount: pictureExport.pendingCount,
    exportedAt: bundle.exportedAt,
    deployedFileNames: allPictures.map((pic) => pic.fileName),
  }
}
