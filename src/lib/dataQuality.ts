import { PLACEHOLDER_LAT, PLACEHOLDER_LNG } from '@/lib/constants'
import type { Building } from '@/types/domain'

const ML_RE = /\bML\b|Missing Lamicoid|No Lamacoid/i
const VACANT_RE = /^(vacant|no information)$/i

/** True when building GPS matches the legacy placeholder coordinate. */
export function hasPlaceholderGps(building: Building): boolean {
  return (
    Math.abs(building.lat - PLACEHOLDER_LAT) < 0.0001 &&
    Math.abs(building.lng - PLACEHOLDER_LNG) < 0.0001
  )
}

/** Count RTUs flagged as missing lamicoid (ML) in name or description. */
export function mlCount(building: Building): number {
  return (building.rtus ?? []).filter((rtu) =>
    ML_RE.test(`${rtu.name} ${rtu.description}`),
  ).length
}

/** True when any tenant description is "vacant" or "no information". */
export function hasVacant(building: Building): boolean {
  return (building.tenants ?? []).some((tenant) =>
    VACANT_RE.test((tenant.description ?? '').trim()),
  )
}
