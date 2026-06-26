import type { PortfolioData } from '@/types/domain'
import type { RtuPricingRow } from '@/lib/rtuPricingSheet'

export const DEPLOY_BUNDLE_VERSION = 1

export interface DeployPictureEntry {
  fileName: string
  rtuKey: string
  index: number
  mimeType: string
  base64: string
}

export interface DeploySchedulePayload {
  replacementYears?: Record<string, string>
  notes?: Record<string, string>
  sourceFile?: string | null
}

export interface DeployPricingPayload {
  version?: string | null
  sourceFile?: string | null
  rows: RtuPricingRow[]
}

export interface DeployBundle {
  version: typeof DEPLOY_BUNDLE_VERSION
  exportedAt: string
  portfolio: PortfolioData
  schedule: DeploySchedulePayload
  pricing: DeployPricingPayload
  pictures: DeployPictureEntry[]
  /** `rtuKey|fileName` entries hidden from the map (manifest/R2 pictures). */
  hiddenRtuPictures?: string[]
}
