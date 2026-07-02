/** Export local browser data (portfolio, schedule, pricing, IndexedDB pictures) for GitHub deploy. */

import {
  DEPLOY_BUNDLE_VERSION,
  type DeployBundle,
  type DeployPictureEntry,
} from '@/types/deployBundle'
import { BUILD_VERSION_LABEL } from '@/generated/buildVersion'
import type { PortfolioData } from '@/types/domain'
import { exportHiddenRtuPicturesForDeploy } from '@/lib/hiddenRtuPictures'
import { exportLocalDocumentsManifestForDeploy } from '@/lib/localDocumentsManifest'
import { isValidStoredPortfolio } from '@/hooks/usePortfolioData'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const SCHEDULE_KEY = STORAGE_KEYS.rtuSchedule
const PRICING_KEY = STORAGE_KEYS.rtuPricing
const PORTFOLIO_KEY = STORAGE_KEYS.portfolio

export interface DeployBundleExportResult {
  bundle: DeployBundle
  picturesOmitted: boolean
  pictureCount: number
  pictureExportFailed: string[]
  pendingPictureCount: number
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

/** Read pending IndexedDB RTU pictures for deploy (map upload / bulk import). */
export async function exportIndexedDbPicturesForDeploy(): Promise<DeployPictureEntry[]> {
  const { exportPendingPicturesForDeploy } = await import('@/lib/rtuPictures')
  const { pictures } = await exportPendingPicturesForDeploy()
  return pictures
}

export interface DeployPictureExportSummary {
  pictures: DeployPictureEntry[]
  failedFileNames: string[]
  pendingCount: number
}

export async function exportIndexedDbPicturesForDeployWithMeta(): Promise<DeployPictureExportSummary> {
  const { exportPendingPicturesForDeploy } = await import('@/lib/rtuPictures')
  return exportPendingPicturesForDeploy()
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

function collectDeployBundleCore(portfolio: PortfolioData): Omit<DeployBundle, 'pictures' | 'documents'> {
  const documentsManifest = exportLocalDocumentsManifestForDeploy()
  return {
    version: DEPLOY_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    portfolio: readPortfolioFromStorage(portfolio),
    schedule: readScheduleFromStorage(),
    pricing: readPricingFromStorage(),
    hiddenRtuPictures: exportHiddenRtuPicturesForDeploy(),
    ...(documentsManifest ? { documentsManifest } : {}),
    clientBuildVersionLabel: BUILD_VERSION_LABEL,
  }
}

/** Portfolio, schedule, and pricing only — no picture/document base64 (safe for one-click sync). */
export function collectDeployBundleLean(portfolio: PortfolioData): Omit<DeployBundle, 'pictures' | 'documents'> {
  return collectDeployBundleCore(portfolio)
}

/** Collect a deploy bundle from the current browser state (local dev is source of truth). */
export async function collectDeployBundle(portfolio: PortfolioData): Promise<DeployBundle> {
  const pictureExport = await exportIndexedDbPicturesForDeployWithMeta()
  const documentExport = await import('@/lib/rtuDocumentDeploy').then((m) =>
    m.exportPendingDocumentsForDeploy(),
  )
  if (pictureExport.failedFileNames.length) {
    console.warn(
      'Some local RTU pictures could not be read for sync:',
      pictureExport.failedFileNames,
    )
  }
  return {
    ...collectDeployBundleCore(portfolio),
    pictures: pictureExport.pictures,
    documents: documentExport.documents,
  }
}

export async function collectDeployBundleWithMeta(
  portfolio: PortfolioData,
): Promise<{ bundle: DeployBundle; pictureExport: DeployPictureExportSummary }> {
  const pictureExport = await exportIndexedDbPicturesForDeployWithMeta()
  const documentExport = await import('@/lib/rtuDocumentDeploy').then((m) =>
    m.exportPendingDocumentsForDeploy(),
  )
  const bundle: DeployBundle = {
    ...collectDeployBundleCore(portfolio),
    pictures: pictureExport.pictures,
    documents: documentExport.documents,
  }
  return { bundle, pictureExport }
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
      throw new Error('Export cancelled', { cause: error })
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

  const { bundle, pictureExport } = await collectDeployBundleWithMeta(portfolio)
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
    pictureExportFailed: pictureExport.failedFileNames,
    pendingPictureCount: pictureExport.pendingCount,
  }
}
