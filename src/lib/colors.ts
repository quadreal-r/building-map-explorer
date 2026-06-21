import { DEFAULT_PARK_COLOR, PARK_COLORS } from '@/lib/constants'

/** Resolve park color, ignoring optional "(x N)" building-count suffix. */
export function getColor(park: string): string {
  if (PARK_COLORS[park]) return PARK_COLORS[park]

  const basePark = park.replace(/\s*\(x\s*\d+\)\s*$/, '').trim().toLowerCase()
  for (const key of Object.keys(PARK_COLORS)) {
    const normalized = key.replace(/\s*\(x\s*\d+\)\s*$/, '').trim().toLowerCase()
    if (normalized === basePark) return PARK_COLORS[key] ?? DEFAULT_PARK_COLOR
  }

  return DEFAULT_PARK_COLOR
}
