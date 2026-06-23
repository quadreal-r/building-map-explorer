import type { Building, LatLng, Polygon } from '@/types/domain'

export type PolygonBuildingIndex = Map<string, Polygon[]>

export function polygonCentroid(paths: LatLng[]): { lat: number; lng: number } {
  const lats = paths.map((p) => p.lat)
  const lngs = paths.map((p) => p.lng)
  return {
    lat: lats.reduce((a, v) => a + v, 0) / lats.length,
    lng: lngs.reduce((a, v) => a + v, 0) / lngs.length,
  }
}

export function nearestBuilding(
  buildings: Building[],
  lat: number,
  lng: number,
): Building | null {
  let best: Building | null = null
  let bestDist = Infinity
  for (const building of buildings) {
    if (!building.lat || !building.lng) continue
    const d = (building.lat - lat) ** 2 + (building.lng - lng) ** 2
    if (d < bestDist) {
      bestDist = d
      best = building
    }
  }
  return best
}

export function buildPolygonBuildingIndex(
  buildings: Building[],
  polygons: Polygon[],
): PolygonBuildingIndex {
  const index: PolygonBuildingIndex = new Map()
  for (const building of buildings) {
    index.set(building.address, [])
  }
  for (const polygon of polygons) {
    if (polygon.paths.length < 3) continue
    const centroid = polygonCentroid(polygon.paths)
    const building = nearestBuilding(buildings, centroid.lat, centroid.lng)
    if (!building) continue
    const list = index.get(building.address) ?? []
    list.push(polygon)
    index.set(building.address, list)
  }
  return index
}

export function polygonsForBuilding(
  index: PolygonBuildingIndex,
  address: string,
): Polygon[] {
  return index.get(address) ?? []
}

export function tenantPolygonCount(
  index: PolygonBuildingIndex,
  address: string,
): number {
  return polygonsForBuilding(index, address).length
}
