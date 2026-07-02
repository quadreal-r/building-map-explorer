/** Canonical localStorage keys — single source of truth for browser persistence. */
export const STORAGE_KEYS = {
  portfolio: 'bme-portfolio',
  portfolioUnsaved: 'bme-portfolio-unsaved',
  rtuSchedule: 'bme-rtu-schedule',
  rtuPricing: 'bme-rtu-pricing',
  remoteSyncState: 'bme-remote-sync-state',
  hiddenRtuPictures: 'bme-hidden-rtu-pictures',
  localDocumentsManifest: 'bme-local-documents-manifest',
  settings: 'bme-settings',
  syncHistory: 'bme-sync-history',
  searchHistory: 'bme-search-history',
  hardRefreshView: 'bme-hard-refresh-view',
} as const
