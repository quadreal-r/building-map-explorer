export const SYNC_META_VERSION = 1

export interface SyncMetaSummary {
  buildingCount: number
  rtuCount: number
  utilityCount: number
  polygonCount: number
  manifestPictureCount: number
  picturesUploaded: number
  /** Number of picture JSON chunks uploaded in one Settings sync (1 when all fit one batch). */
  pictureChunkCount?: number
  /** Manifest entries added during this sync (uploads + new links). */
  picturesAdded?: number
  /** Manifest entries removed during this sync (hides / replacements). */
  picturesRemoved?: number
  /** New hidden-picture keys applied during this sync. */
  picturesHidden?: number
  /** App build version on GitHub after CI applied the bundle. */
  buildVersionLabel?: string
  /** App build version in the browser that exported the bundle (may differ until code is pushed). */
  clientBuildVersionLabel?: string
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
