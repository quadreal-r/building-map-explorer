const LOCALE = 'en-CA'

/** Format integer with locale grouping. */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString(LOCALE)
}

/** Format currency (no decimals). */
export function formatMoney(value: number): string {
  return `$${formatInteger(value)}`
}

/** Format one decimal place tonnage. */
export function formatTons(tons: number): string {
  return (Math.round(tons * 10) / 10).toLocaleString(LOCALE)
}

/** Format square footage for sidebar tags and stats. */
export function formatSqft(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw === 'New Development') return 'New Dev'
  const parsed = parseInt(raw.replace(/,/g, ''), 10)
  if (Number.isNaN(parsed)) return raw
  return `${parsed.toLocaleString(LOCALE)} sf`
}

/** Aggregate sqft display (supports M-suffix for large totals). */
export function formatTotalSqft(totalSqft: number): string {
  if (totalSqft >= 1_000_000) {
    return `${(totalSqft / 1_000_000).toFixed(2)}M sf`
  }
  return `${totalSqft.toLocaleString(LOCALE)} sf`
}

/** Build cost-estimator scope label from active filters. */
export function formatFilterScope(parts: {
  park?: string
  cluster?: string
  manager?: string
  search?: string
}): string {
  const labels: string[] = []
  if (parts.park) labels.push(parts.park)
  if (parts.cluster) labels.push(parts.cluster)
  if (parts.manager) labels.push(`Mgr: ${parts.manager}`)
  if (parts.search?.trim()) labels.push(`"${parts.search.trim()}"`)
  return labels.length > 0 ? labels.join(' · ') : 'All buildings'
}

/** Truncate long strings for compact UI labels. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}
