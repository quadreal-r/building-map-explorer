import { loadRemotePortfolio, persistPortfolio } from '@/hooks/usePortfolioData'
import { fetchRemoteJson, getJsonDataBaseUrl } from '@/lib/jsonDataUrls'
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
    useRtuScheduleStore.getState().persist()
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
}

/** Pull portfolio, schedule, and pricing from Cloudflare R2 into this browser. */
export async function pullRemoteUpdatesToLocal(): Promise<PortfolioData> {
  const baseUrl = getJsonDataBaseUrl()
  if (!baseUrl) {
    throw new Error('Remote JSON is not configured on this site.')
  }

  const portfolio = await loadRemotePortfolio(baseUrl)
  if (!portfolio) {
    throw new Error('Could not load portfolio from Cloudflare.')
  }

  persistPortfolio(portfolio, { markSynced: true })
  await pullRemoteScheduleAndPricing()

  const { clearRtuPictureManifestCache } = await import('@/lib/rtuPictures')
  clearRtuPictureManifestCache()
  const { clearRtuDocumentsManifestCache } = await import('@/lib/rtuDocuments')
  clearRtuDocumentsManifestCache()

  return portfolio
}
