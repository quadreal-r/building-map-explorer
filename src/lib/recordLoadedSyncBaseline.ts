import { recordSyncBaseline, type RecordSyncBaselineOptions } from '@/lib/syncState'
import type { PortfolioData } from '@/types/domain'

export type { RecordSyncBaselineOptions as RecordLoadedSyncBaselineOptions }

/**
 * After loading portfolio/schedule/pricing from Cloudflare (or discard),
 * align fingerprint baselines so unsynced warnings reflect real edits only.
 */
export async function recordLoadedSyncBaseline(
  portfolio: PortfolioData,
  options?: RecordSyncBaselineOptions,
): Promise<boolean> {
  return recordSyncBaseline(portfolio, options)
}
