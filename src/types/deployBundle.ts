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

export interface DeployDocumentEntry {
  fileName: string
  rtuKey: string
  mimeType: string
  base64: string
}

export interface DeployDocumentsManifestPayload {
  entries: Record<string, string[]>
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
  /** Document files with base64 payload (Settings sync chunks or local export). */
  documents?: DeployDocumentEntry[]
  /** Document batches in sync/deploy-documents-N.json (Settings sync). */
  documentChunkCount?: number
  /** Local manifest additions merged into documents-manifest.json on deploy. */
  documentsManifest?: DeployDocumentsManifestPayload
  /** Picture batches in sync/deploy-pictures-N.json (Settings sync). */
  pictureChunkCount?: number
  /** Hidden RTU picture keys hidden from the map (manifest/R2 pictures). */
  hiddenRtuPictures?: string[]
  /** Browser build stamp when the bundle was exported (Settings sync). */
  clientBuildVersionLabel?: string
}
