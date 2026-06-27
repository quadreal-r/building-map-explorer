import { distanceFeet } from '@/lib/geo'
import type { Building, PortfolioData } from '@/types/domain'

/** Warn on save when an RTU pin is farther than this from its selected building. */
export const RTU_MARKER_BUILDING_WARN_FEET = 2_000

export interface MarkerPlacementIssue {
  buildingAddress: string
  rtuName: string
  feetFromBuilding: number
  nearestBuildingAddress: string
  nearestBuildingFeet: number
}

export function findNearestBuildingByDistance(
  buildings: Building[],
  lat: number,
  lng: number,
): { building: Building; feet: number } | null {
  let best: { building: Building; feet: number } | null = null
  for (const building of buildings) {
    if (!Number.isFinite(building.lat) || !Number.isFinite(building.lng)) continue
    const feet = distanceFeet(lat, lng, building.lat, building.lng)
    if (!best || feet < best.feet) {
      best = { building, feet }
    }
  }
  return best
}

export function rtuDistanceFromBuilding(
  building: Building,
  lat: number,
  lng: number,
): number {
  if (!Number.isFinite(building.lat) || !Number.isFinite(building.lng)) {
    return Number.POSITIVE_INFINITY
  }
  return distanceFeet(lat, lng, building.lat, building.lng)
}

export function findPortfolioMarkerPlacementIssues(
  portfolio: PortfolioData,
  warnFeet = RTU_MARKER_BUILDING_WARN_FEET,
): MarkerPlacementIssue[] {
  const issues: MarkerPlacementIssue[] = []
  for (const building of portfolio.buildings) {
    for (const rtu of building.rtus ?? []) {
      const feetFromBuilding = rtuDistanceFromBuilding(building, rtu.lat, rtu.lng)
      if (feetFromBuilding <= warnFeet) continue
      const nearest = findNearestBuildingByDistance(portfolio.buildings, rtu.lat, rtu.lng)
      issues.push({
        buildingAddress: building.address,
        rtuName: rtu.name,
        feetFromBuilding,
        nearestBuildingAddress: nearest?.building.address ?? building.address,
        nearestBuildingFeet: nearest?.feet ?? feetFromBuilding,
      })
    }
  }
  return issues.sort((a, b) => b.feetFromBuilding - a.feetFromBuilding)
}

export function formatMarkerPlacementIssue(issue: MarkerPlacementIssue): string {
  const miles = (issue.feetFromBuilding / 5280).toFixed(1)
  return `${issue.rtuName} on "${issue.buildingAddress}" is ${Math.round(issue.feetFromBuilding)} ft (${miles} mi) from that building — nearest is ${issue.nearestBuildingAddress}`
}

export function confirmPortfolioMarkerPlacements(issues: MarkerPlacementIssue[]): boolean {
  if (issues.length === 0) return true
  const lines = issues.slice(0, 8).map(formatMarkerPlacementIssue)
  const extra = issues.length > 8 ? `\n…and ${issues.length - 8} more.` : ''
  return window.confirm(
    `${issues.length} RTU marker(s) look far from their assigned building:\n\n${lines.join('\n')}${extra}\n\nSync anyway? Wrong assignments will show on other browsers after deploy.`,
  )
}

export function confirmRtuMarkerBuildingPlacement(
  building: Building,
  lat: number,
  lng: number,
  buildings: Building[],
): boolean {
  const feet = rtuDistanceFromBuilding(building, lat, lng)
  if (feet <= RTU_MARKER_BUILDING_WARN_FEET) return true

  const nearest = findNearestBuildingByDistance(buildings, lat, lng)
  const nearestHint =
    nearest && nearest.building.address !== building.address
      ? `\n\nNearest building is "${nearest.building.address}" (${Math.round(nearest.feet)} ft).`
      : ''

  return window.confirm(
    `This pin is about ${Math.round(feet)} ft from "${building.address}".${nearestHint}\n\nSave on the selected building anyway?`,
  )
}
