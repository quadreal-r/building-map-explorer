import {
  RCB_DEFAULT_THRESHOLD,
  RCB_TIERS,
  RCB_YEARS,
  RTU_PRICING,
  type RtuPricingUnit,
} from '@/lib/costEstimator.pricing'
import { getRtuAge, getRtuYear, parseRtuMeta, rcbGetTons } from '@/lib/rtu'
import type { Building, CostBasis } from '@/types/domain'

export {
  RTU_PRICING,
  RCB_TIERS,
  RCB_YEARS,
  type RtuPricingUnit,
} from '@/lib/costEstimator.pricing'

export interface RcbTierMatch {
  tier: number
  key: string
  unit: RtuPricingUnit
}

export interface RcbBuildingSummary {
  address: string
  park: string
  cluster: string
  manager: string
  units: number
  tons: number
  cost: number
}

export interface RcbLineItem {
  address: string
  park: string
  cluster: string
  manager: string
  rtu: string
  model: string
  serial: string
  make: string
  suite: string
  year: number | null
  age: number | null
  tons: number | null
  tierKey: number
  tier: string
  cost: number
}

export type RcbScheduledLineItem = RcbLineItem & { replacementYear: string }

export interface RcbTierAggregate {
  tier: number
  label: string
  unit: number
  qty: number
  ext: number
}

export interface RcbTotals {
  bldgCount: number
  units: number
  tons: number
  cost: number
  excludedOld: number
}

export interface RcbComputeResult {
  basis: CostBasis
  year: string
  threshold: number
  scope: string
  perBldg: RcbBuildingSummary[]
  tiers: Record<string, RcbTierAggregate>
  lineItems: RcbLineItem[]
  totals: RcbTotals
}

export interface RcbProjectionPoint {
  year: string
  total: number
}

export function rcbMoney(amount: number): string {
  return `$${Math.round(amount || 0).toLocaleString('en-CA')}`
}

/** Display cooling tonnage as e.g. "5 Ton" or "7.5 Ton". */
export function formatRtuTons(tons: number | null | undefined): string {
  if (tons == null || tons <= 0) return '—'
  const rounded = Math.round(tons * 10) / 10
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${label} Ton`
}

/** Round tons up to the nearest supplied pricing tier. */
export function rcbTierFor(tons: number | null): RcbTierMatch | null {
  if (!tons || tons <= 0) return null

  let tier: number | null = null
  for (const candidate of RCB_TIERS) {
    if (candidate >= tons - 0.001) {
      tier = candidate
      break
    }
  }
  if (tier === null) tier = RCB_TIERS[RCB_TIERS.length - 1]!

  const key = String(tier)
  const unit = RTU_PRICING[key]
  if (!unit) return null

  return { tier, key, unit }
}

/** Look up installed cost for a unit at the chosen basis and replacement year. */
export function rcbUnitCost(
  unit: RtuPricingUnit,
  basis: CostBasis,
  year: string,
): number | null {
  const table = unit[basis]
  if (!table) return null
  const cost = table[year]
  return cost == null ? null : cost
}

export interface RcbComputeOptions {
  basis?: CostBasis
  year?: string
  threshold?: number
  scope?: string
  currentYear?: number
}

/** Core replacement-cost computation for in-scope buildings. */
export function rcbCompute(
  buildings: Building[],
  options: RcbComputeOptions = {},
): RcbComputeResult {
  const basis = options.basis ?? 'hyb'
  const year =
    options.year ??
    (basis === 'std' ? '2025' : '2026')
  const threshold = options.threshold ?? RCB_DEFAULT_THRESHOLD
  const scope = options.scope ?? 'All buildings'
  const nowYear = options.currentYear

  const perBldg: RcbBuildingSummary[] = []
  const tiers: Record<string, RcbTierAggregate> = {}
  const lineItems: RcbLineItem[] = []
  let totUnits = 0
  let totTons = 0
  let totCost = 0
  let excludedOld = 0

  for (const building of buildings) {
    const summary = { units: 0, tons: 0, cost: 0 }

    for (const rtu of building.rtus ?? []) {
      const age = getRtuAge(rtu, nowYear)
      if (age == null || age < threshold) continue

      const tons = rcbGetTons(rtu)
      const tierMatch = rcbTierFor(tons)
      const cost = tierMatch
        ? rcbUnitCost(tierMatch.unit, basis, year)
        : null

      if (cost == null || tierMatch == null) {
        excludedOld++
        continue
      }

      summary.units++
      summary.tons += tons ?? 0
      summary.cost += cost
      totUnits++
      totTons += tons ?? 0
      totCost += cost

      const tierKey = tierMatch.key
      if (!tiers[tierKey]) {
        tiers[tierKey] = {
          tier: tierMatch.tier,
          label: tierMatch.unit.l,
          unit: cost,
          qty: 0,
          ext: 0,
        }
      }
      tiers[tierKey].qty++
      tiers[tierKey].ext += cost

      const meta = parseRtuMeta(rtu)
      lineItems.push({
        address: building.address,
        park: building.park,
        cluster: building.cluster ?? '',
        manager: building.manager ?? '',
        rtu: rtu.name,
        model: meta.model,
        serial: meta.serial,
        make: meta.make,
        suite: meta.suite,
        year: getRtuYear(rtu),
        age,
        tons,
        tierKey: tierMatch.tier,
        tier: tierMatch.unit.l,
        cost,
      })
    }

    if (summary.units > 0) {
      perBldg.push({
        address: building.address,
        park: building.park,
        cluster: building.cluster ?? '',
        manager: building.manager ?? '',
        units: summary.units,
        tons: summary.tons,
        cost: summary.cost,
      })
    }
  }

  return {
    basis,
    year,
    threshold,
    scope,
    perBldg,
    tiers,
    lineItems,
    totals: {
      bldgCount: perBldg.length,
      units: totUnits,
      tons: totTons,
      cost: totCost,
      excludedOld,
    },
  }
}

/** Build a human-readable scope label from active filters. */
export function rcbScopeLabel(parts: {
  park?: string
  cluster?: string
  manager?: string
  search?: string
}): string {
  const labels: string[] = []
  if (parts.park) labels.push(parts.park)
  if (parts.cluster) labels.push(parts.cluster)
  if (parts.manager) labels.push(`Mgr: ${parts.manager}`)
  const search = parts.search?.trim()
  if (search) labels.push(`"${search}"`)
  return labels.length > 0 ? labels.join(' · ') : 'All buildings'
}

/** Line items for one building, sorted by RTU name. */
export function rcbLineItemsForBuilding(
  result: RcbComputeResult,
  address: string,
): RcbLineItem[] {
  return result.lineItems
    .filter((item) => item.address === address)
    .sort((a, b) => a.rtu.localeCompare(b.rtu))
}

export function rcbReplacementYearKey(address: string, rtu: string): string {
  return `${address}::${rtu}`
}

/** Unit cost for a priced tier at a specific replacement year. */
export function rcbCostForTier(
  tierKey: number,
  basis: CostBasis,
  replacementYear: string,
): number | null {
  const unit = RTU_PRICING[String(tierKey)]
  return unit ? rcbUnitCost(unit, basis, replacementYear) : null
}

/**
 * Apply per-RTU replacement year assignments on top of the global default year.
 * Unassigned RTUs inherit defaultYear; cost follows projection-by-year pricing.
 */
export function rcbLineItemsWithReplacementYears(
  items: RcbLineItem[],
  basis: CostBasis,
  defaultYear: string,
  assignments: Record<string, string> = {},
): RcbScheduledLineItem[] {
  return items.map((item) => {
    const key = rcbReplacementYearKey(item.address, item.rtu)
    const replacementYear = assignments[key] ?? defaultYear
    const cost = rcbCostForTier(item.tierKey, basis, replacementYear) ?? item.cost
    return { ...item, replacementYear, cost }
  })
}

/** Drop assignments that match the default year or are invalid for the current basis. */
export function rcbSanitizeReplacementYearAssignments(
  assignments: Record<string, string>,
  allowedYears: string[],
  defaultYear: string,
): Record<string, string> {
  const allowed = new Set(allowedYears)
  const next: Record<string, string> = {}
  for (const [key, year] of Object.entries(assignments)) {
    if (year !== defaultYear && allowed.has(year)) next[key] = year
  }
  return next
}

export interface RcbScheduledExport {
  defaultYear: string
  items: RcbScheduledLineItem[]
  perBldg: RcbBuildingSummary[]
  tiers: RcbTierAggregate[]
  totals: Pick<RcbTotals, 'units' | 'tons' | 'cost' | 'bldgCount'>
  customizedCount: number
}

/** Merge global RCB result with per-RTU replacement year assignments for export/display. */
export function rcbBuildScheduledExport(
  result: RcbComputeResult,
  replacementYearByRtu: Record<string, string> = {},
): RcbScheduledExport {
  const defaultYear = result.year
  const items = rcbLineItemsWithReplacementYears(
    result.lineItems,
    result.basis,
    defaultYear,
    replacementYearByRtu,
  )

  const perBldgMap = new Map<string, RcbBuildingSummary>()
  for (const item of items) {
    let row = perBldgMap.get(item.address)
    if (!row) {
      row = {
        address: item.address,
        park: item.park,
        cluster: item.cluster,
        manager: item.manager,
        units: 0,
        tons: 0,
        cost: 0,
      }
      perBldgMap.set(item.address, row)
    }
    row.units++
    row.tons += item.tons ?? 0
    row.cost += item.cost
  }

  const perBldg = [...perBldgMap.values()].sort((a, b) => b.cost - a.cost)
  const tiers = rcbTierBreakdownForItems(items)
  const cost = items.reduce((sum, item) => sum + item.cost, 0)
  const tons = items.reduce((sum, item) => sum + (item.tons ?? 0), 0)
  const customizedCount = items.filter((item) => item.replacementYear !== defaultYear).length

  return {
    defaultYear,
    items,
    perBldg,
    tiers,
    totals: {
      bldgCount: perBldg.length,
      units: items.length,
      tons,
      cost,
    },
    customizedCount,
  }
}

/** Tonnage-tier rollup for a subset of line items (e.g. one building). */
export function rcbTierBreakdownForItems(items: RcbLineItem[]): RcbTierAggregate[] {
  const map = new Map<number, RcbTierAggregate>()
  for (const item of items) {
    const existing = map.get(item.tierKey)
    if (existing) {
      existing.qty++
      existing.ext += item.cost
    } else {
      map.set(item.tierKey, {
        tier: item.tierKey,
        label: item.tier,
        unit: item.cost,
        qty: 1,
        ext: item.cost,
      })
    }
  }
  for (const row of map.values()) {
    row.unit = row.qty ? Math.round(row.ext / row.qty) : 0
  }
  return [...map.values()].sort((a, b) => a.tier - b.tier)
}

/** Project total cost across every available year for the current basis. */
export function rcbProjection(result: RcbComputeResult): RcbProjectionPoint[] {
  const years = RCB_YEARS[result.basis] ?? [result.year]
  const tierKeys = Object.keys(result.tiers)

  return years.map((year) => {
    let total = 0
    for (const key of tierKeys) {
      const tier = result.tiers[key]
      const unit = RTU_PRICING[key]
      const cost = unit?.[result.basis]?.[year]
      if (cost != null && tier) total += tier.qty * cost
    }
    return { year, total }
  })
}
