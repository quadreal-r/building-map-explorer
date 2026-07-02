import {
  loadFreshPortfolioSnapshot,
  persistPortfolio,
  type PortfolioSnapshotSource,
} from '@/hooks/usePortfolioData'
import { clearDeployDataDirty, syncDeployDirtyFlag } from '@/lib/deploySyncSnapshot'
import { fetchRemoteJson } from '@/lib/jsonDataUrls'
import { useRtuPricingStore } from '@/stores/rtuPricingStore'
import { useRtuScheduleStore } from '@/stores/rtuScheduleStore'
import type { PortfolioData } from '@/types/domain'
import type { RtuPricingRow } from '@/lib/rtuPricingSheet'

const SCHEDULE_KEY = 'bme-rtu-schedule'
const PRICING_KEY = 'bme-rtu-pricing'

interface StoredRtuSchedule {
  replacementYears?: Record<string, string>
  notes?: Record<string, string>
  sourceFile?: string | null
}

interface StoredRtuPricing {
  version?: string | null
  sourceFile?: string | null
  rows?: RtuPricingRow[]
}

/** Pull RTU schedule and pricing from Cloudflare when available. */
export async function pullRemoteScheduleAndPricing(): Promise<void> {
  const schedule = await fetchRemoteJson<StoredRtuSchedule>('rtu-schedule.json')
  if (schedule) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
    useRtuScheduleStore.setState({
      replacementYears: schedule.replacementYears ?? {},
      notes: schedule.notes ?? {},
      sourceFile: schedule.sourceFile ?? null,
      loaded: true,
    })
  }

  const pricing = await fetchRemoteJson<StoredRtuPricing>('rtu-pricing-rows.json')
  if (pricing?.rows?.length) {
    localStorage.setItem(PRICING_KEY, JSON.stringify(pricing))
    useRtuPricingStore.getState().applyPricingImport(
      pricing.rows,
      pricing.version ?? null,
      pricing.sourceFile ?? 'remote',
    )
  }

  syncDeployDirtyFlag()
}

export interface PullRemoteUpdatesResult {
  portfolio: PortfolioData
  source: PortfolioSnapshotSource
}

/** Pull portfolio, schedule, and pricing from Cloudflare (or bundled fallback) into this browser. */
export async function pullRemoteUpdatesToLocal(): Promise<PullRemoteUpdatesResult> {
  const { portfolio, source } = await loadFreshPortfolioSnapshot()
  if (!portfolio.buildings.length) {
    throw new Error('Could not load portfolio data.')
  }

  persistPortfolio(portfolio, { markSynced: true })
  clearDeployDataDirty()

  if (source === 'cloudflare') {
    await pullRemoteScheduleAndPricing()
  }

  const { clearRtuPictureManifestCache } = await import('@/lib/rtuPictures')
  clearRtuPictureManifestCache()
  const { clearRtuDocumentsManifestCache } = await import('@/lib/rtuDocuments')
  clearRtuDocumentsManifestCache()

  return { portfolio, source }
}
