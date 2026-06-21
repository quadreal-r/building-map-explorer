import type { Building, Rtu } from '@/types/domain'

const INSTALL_YEAR_RE =
  /Date Installed[:\s]+(?:[A-Za-z]+ +\d+, +)?(\d{4})/i

/** Current calendar year (override in tests). */
export function currentYear(now: Date = new Date()): number {
  return now.getFullYear()
}

/** Parse install year from RTU description or use DB column when present. */
export function getRtuYear(rtu: Rtu): number | null {
  if (rtu.install_year != null) return rtu.install_year
  const match = rtu.description.match(INSTALL_YEAR_RE)
  return match ? parseInt(match[1]!, 10) : null
}

/** Age in whole years; null when install year is unknown. */
export function getRtuAge(rtu: Rtu, year: number = currentYear()): number | null {
  const installYear = getRtuYear(rtu)
  return installYear != null ? year - installYear : null
}

/** Oldest RTU age on a building; 0 when none have a known year. */
export function oldestRtuAge(building: Building, year: number = currentYear()): number {
  let oldest = 0
  for (const rtu of building.rtus ?? []) {
    const age = getRtuAge(rtu, year)
    if (age != null && age > oldest) oldest = age
  }
  return oldest
}

const TON_RE = /\(\s*([\d.]+)\s*ton/i
const BTU_RE = /Cooling Capacity[:\s]*([\d,]+)\s*BTU/i

/** Parse cooling tonnage from RTU description or DB column. */
export function rcbGetTons(rtu: Rtu): number | null {
  if (rtu.cooling_tons != null) return rtu.cooling_tons

  const desc = rtu.description
  const tonMatch = desc.match(TON_RE)
  if (tonMatch) return parseFloat(tonMatch[1]!)

  const btuMatch = desc.match(BTU_RE)
  if (btuMatch) {
    const btu = parseInt(btuMatch[1]!.replace(/,/g, ''), 10)
    if (btu) return Math.round((btu / 12000) * 10) / 10
  }

  return null
}
