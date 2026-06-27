import type { PortfolioData } from '@/types/domain'
import type { SyncMetaSummary } from '@/types/syncMeta'

export function countPortfolioStats(portfolio: PortfolioData): Pick<
  SyncMetaSummary,
  'buildingCount' | 'rtuCount' | 'utilityCount' | 'polygonCount'
> {
  let rtuCount = 0
  for (const building of portfolio.buildings) {
    rtuCount += building.rtus?.length ?? 0
  }
  return {
    buildingCount: portfolio.buildings.length,
    rtuCount,
    utilityCount: portfolio.utilities.length,
    polygonCount: portfolio.polygons.length,
  }
}

export function buildLocalSyncSummary(
  portfolio: PortfolioData,
  scheduleYears: number,
  scheduleNotes: number,
  pricingRows: number,
): SyncMetaSummary {
  return {
    ...countPortfolioStats(portfolio),
    manifestPictureCount: 0,
    picturesUploaded: 0,
    scheduleYearCount: scheduleYears,
    scheduleNoteCount: scheduleNotes,
    pricingRowCount: pricingRows,
  }
}

export interface SummaryDeltaLine {
  label: string
  before: number
  after: number
  delta: number
}

export function buildSummaryDeltas(
  local: SyncMetaSummary,
  remote: SyncMetaSummary,
): SummaryDeltaLine[] {
  const fields: Array<{ key: keyof SyncMetaSummary; label: string }> = [
    { key: 'buildingCount', label: 'Buildings' },
    { key: 'rtuCount', label: 'RTU markers' },
    { key: 'utilityCount', label: 'Utility markers' },
    { key: 'polygonCount', label: 'Polygons' },
    { key: 'manifestPictureCount', label: 'RTU pictures (manifest)' },
    { key: 'scheduleYearCount', label: 'Schedule replacement years' },
    { key: 'scheduleNoteCount', label: 'Schedule notes' },
    { key: 'pricingRowCount', label: 'Pricing rows' },
  ]

  return fields
    .map(({ key, label }) => {
      const before = local[key] ?? 0
      const after = remote[key] ?? 0
      return { label, before, after, delta: after - before }
    })
    .filter((line) => line.delta !== 0 || line.before !== line.after)
}
