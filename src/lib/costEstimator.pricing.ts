import type { CostBasis } from '@/types/domain'
import { rowsToRtuPricing, getRcbTiersFromPricing } from '@/lib/rtuPricingSheet'
import { DEFAULT_RTU_PRICING_ROWS } from '@/lib/rtuPricing.defaults'

export interface RtuPricingUnit {
  l: string
  std: Record<string, number>
  hyb: Record<string, number>
}

/** Per-tonnage all-in installed cost by replacement year (from Capital_RTU_Replacement workbook). */
export const RTU_PRICING: Record<string, RtuPricingUnit> =
  rowsToRtuPricing(DEFAULT_RTU_PRICING_ROWS)

export const RCB_TIERS: number[] = getRcbTiersFromPricing(RTU_PRICING)

export const RCB_YEARS: Record<CostBasis, string[]> = {
  hyb: ['2026', '2027', '2028', '2029', '2030', '2031', '2032'],
  std: ['2025'],
}

export const RCB_DEFAULT_THRESHOLD = 20

export interface RcbPricingTable {
  pricing: Record<string, RtuPricingUnit>
  tiers: number[]
}

export const DEFAULT_RCB_PRICING: RcbPricingTable = {
  pricing: RTU_PRICING,
  tiers: RCB_TIERS,
}
