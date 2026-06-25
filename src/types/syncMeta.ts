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
