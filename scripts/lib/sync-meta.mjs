/**
 * sync-meta.json — lets browsers detect Settings sync from another computer.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPortfolioSummary } from './portfolio-stats.mjs'

export const SYNC_META_VERSION = 1
export const SYNC_META_FILE = 'sync-meta.json'

export function buildSyncMetaFromBundle(bundle, options = {}) {
  const syncedAt = options.syncedAt ?? new Date().toISOString()
  const manifest = options.manifest ?? { entries: {} }
  return {
    version: SYNC_META_VERSION,
    exportedAt: bundle.exportedAt,
    syncedAt,
    source: options.source ?? 'settings-sync',
    summary: buildPortfolioSummary(
      bundle.portfolio,
      bundle.schedule,
      bundle.pricing,
      manifest,
      options.picturesUploaded ?? bundle.pictures?.length ?? 0,
    ),
  }
}

export function buildSyncMetaFromDataDir(dataDir, picsDir, options = {}) {
  const syncedAt = options.syncedAt ?? new Date().toISOString()
  const readJson = (path) => {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8'))
  }

  const buildings = readJson(join(dataDir, 'buildings.json')) ?? []
  const utilities = readJson(join(dataDir, 'utilities.json')) ?? []
  const polygons = readJson(join(dataDir, 'polygons.json')) ?? []
  const schedule = readJson(join(dataDir, 'rtu-schedule.json')) ?? {}
  const pricing = readJson(join(dataDir, 'rtu-pricing-rows.json')) ?? { rows: [] }
  const manifest = readJson(join(picsDir, 'manifest.json')) ?? { entries: {} }

  const portfolio = { buildings, utilities, polygons }
  const existing = options.preserveExportedAt
    ? readJson(join(dataDir, SYNC_META_FILE))
    : null

  return {
    version: SYNC_META_VERSION,
    exportedAt: existing?.exportedAt ?? options.exportedAt ?? syncedAt,
    syncedAt,
    source: options.source ?? existing?.source ?? 'git-push',
    summary: buildPortfolioSummary(portfolio, schedule, pricing, manifest, 0),
  }
}

export function writeSyncMetaFile(path, meta) {
  writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}
