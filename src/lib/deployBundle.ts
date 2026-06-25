/** Export local browser data (portfolio, schedule, pricing, IndexedDB pictures) for GitHub deploy. */

import {
  DEPLOY_BUNDLE_VERSION,
  type DeployBundle,
  type DeployPictureEntry,
} from '@/types/deployBundle'
import type { PortfolioData } from '@/types/domain'
import { isValidStoredPortfolio } from '@/hooks/usePortfolioData'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'

const SCHEDULE_KEY = 'bme-rtu-schedule'
const PRICING_KEY = 'bme-rtu-pricing'
const PORTFOLIO_KEY = 'bme-portfolio'

export interface DeployBundleExportResult {
  bundle: DeployBundle
  picturesOmitted: boolean
  pictureCount: number
}

function readPortfolioFromStorage(fallback: PortfolioData): PortfolioData {
  const raw = localStorage.getItem(PORTFOLIO_KEY)
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isValidStoredPortfolio(parsed)) return parsed
  } catch {
    /* use fallback */
  }
  return fallback
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Read all IndexedDB RTU picture rows for deploy (static/manifest files are already in the repo). */
export async function exportIndexedDbPicturesForDeploy(): Promise<DeployPictureEntry[]> {
  const { exportIndexedDbPictureRows } = await import('@/lib/rtuPictures')
  const rows = await exportIndexedDbPictureRows()
  const out: DeployPictureEntry[] = []
  for (const row of rows) {
    try {
      const blob = row.fullBlob ?? row.thumbBlob
      out.push({
        fileName: row.fileName,
        rtuKey: row.rtuKey,
        index: row.index,
        mimeType: row.mimeType,
        base64: await blobToBase64(blob),
      })
    } catch {
      /* skip unreadable picture rows */
    }
  }
  return out
}

function readScheduleFromStorage(): DeployBundle['schedule'] {
  const raw = localStorage.getItem(SCHEDULE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as DeployBundle['schedule']
    } catch {
      /* fall through */
    }
  }
  const state = useRtuScheduleStore.getState()
  return {
    replacementYears: state.replacementYears,
    notes: state.notes,
    sourceFile: state.sourceFile,
  }
}

function readPricingFromStorage(): DeployBundle['pricing'] {
  const raw = localStorage.getItem(PRICING_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DeployBundle['pricing']
      if (parsed.rows?.length) return parsed
    } catch {
      /* fall through */
    }
  }
  const state = useRtuPricingStore.getState()
  return {
    version: state.version,
    sourceFile: state.sourceFile,
    rows: state.rows,
  }
}

/** Collect a deploy bundle from the current browser state (local dev is source of truth). */
export async function collectDeployBundle(portfolio: PortfolioData): Promise<DeployBundle> {
  return {
    version: DEPLOY_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    portfolio: readPortfolioFromStorage(portfolio),
    schedule: readScheduleFromStorage(),
    pricing: readPricingFromStorage(),
    pictures: await exportIndexedDbPicturesForDeploy(),
  }
}

export function bundleFileName(bundle: DeployBundle): string {
  const d = new Date(bundle.exportedAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `deploy-bundle-${stamp}.json`
}

/** Serialize bundle; omit pictures if JSON would exceed engine limits. */
export function serializeDeployBundle(bundle: DeployBundle): {
  json: string
  picturesOmitted: boolean
} {
  try {
    return { json: JSON.stringify(bundle), picturesOmitted: false }
  } catch {
    if (bundle.pictures.length === 0) {
      throw new Error('Deploy bundle is too large to serialize.')
    }
    const lean: DeployBundle = { ...bundle, pictures: [] }
    return { json: JSON.stringify(lean), picturesOmitted: true }
  }
}

function downloadBlobAsFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 2000)
}

async function requestSaveFileHandle(fileName: string): Promise<FileSystemFileHandle | null> {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<FileSystemFileHandle>
  }).showSaveFilePicker
  if (!picker) return null
  try {
    return await picker({
      suggestedName: fileName,
      types: [
        {
          description: 'Deploy bundle',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Export cancelled')
    }
    return null
  }
}

/**
 * Export deploy bundle to disk.
 * Opens the save dialog immediately (while the click gesture is active), then collects data.
 */
export async function exportDeployBundleToDisk(
  portfolio: PortfolioData,
): Promise<DeployBundleExportResult> {
  const placeholderName = bundleFileName({
    version: DEPLOY_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    portfolio: readPortfolioFromStorage(portfolio),
    schedule: {},
    pricing: { rows: [] },
    pictures: [],
  })
  const fileHandle = await requestSaveFileHandle(placeholderName)

  const bundle = await collectDeployBundle(portfolio)
  const fileName = bundleFileName(bundle)
  const { json, picturesOmitted } = serializeDeployBundle(bundle)
  const blob = new Blob([json], { type: 'application/json' })

  if (fileHandle) {
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  } else {
    downloadBlobAsFile(blob, fileName)
  }

  return {
    bundle,
    picturesOmitted,
    pictureCount: bundle.pictures.length,
  }
}

/** @deprecated Use exportDeployBundleToDisk — kept for tests. */
export function downloadDeployBundle(bundle: DeployBundle): void {
  const { json } = serializeDeployBundle(bundle)
  downloadBlobAsFile(new Blob([json], { type: 'application/json' }), bundleFileName(bundle))
}
