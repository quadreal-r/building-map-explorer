export const SYNC_META_VERSION = 1

export interface SyncMetaSummary {
  buildingCount: number
  rtuCount: number
  utilityCount: number
  polygonCount: number
  manifestPictureCount: number
  picturesUploaded: number
  scheduleYearCount: number
  scheduleNoteCount: number
  pricingRowCount: number
}

export interface SyncMeta {
  version: number
  exportedAt: string
  syncedAt: string
  source: 'settings-sync' | 'git-push' | string
  summary: SyncMetaSummary
}

export interface SyncHistoryChange {
  label: string
  before: number
  after: number
  delta: number
}

export interface SyncHistoryEntry {
  syncedAt: string
  exportedAt: string
  source: string
  summary: SyncMetaSummary
  changes: SyncHistoryChange[]
}

export interface SyncHistory {
  version: number
  entries: SyncHistoryEntry[]
}
