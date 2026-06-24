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
    const blob = row.fullBlob ?? row.thumbBlob
    out.push({
      fileName: row.fileName,
      rtuKey: row.rtuKey,
      index: row.index,
      mimeType: row.mimeType,
      base64: await blobToBase64(blob),
    })
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

export function downloadDeployBundle(bundle: DeployBundle): void {
  const json = JSON.stringify(bundle)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date(bundle.exportedAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  a.download = `deploy-bundle-${stamp}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
