import { MAP_DETAIL_ZOOM } from '@/lib/constants'
import type { Building, Polygon } from '@/types/domain'

export type SearchHitKind = 'rtu' | 'polygon' | 'building'

export interface SearchHit {
  kind: SearchHitKind
  label: string
  lat: number
  lng: number
  layerKey?: 'rtu'
  detailName?: string
  buildingAddress?: string
  polygonName?: string
  polygonDescription?: string
  address?: string
}

function normalizeSearch(search: string): string {
  return search.trim().toLowerCase()
}

function buildingMetadataMatches(building: Building, q: string): boolean {
  return (
    building.address.toLowerCase().includes(q) ||
    Boolean(building.bu?.toLowerCase().includes(q)) ||
    Boolean(building.cluster?.toLowerCase().includes(q)) ||
    Boolean(building.manager?.toLowerCase().includes(q))
  )
}

function polygonCentroid(polygon: Polygon): { lat: number; lng: number } {
  const lats = polygon.paths.reduce((sum, pt) => sum + pt.lat, 0)
  const lngs = polygon.paths.reduce((sum, pt) => sum + pt.lng, 0)
  return { lat: lats / polygon.paths.length, lng: lngs / polygon.paths.length }
}

/** Collect map popup targets for a search term (RTU markers, tenant polygons, buildings). */
export function collectSearchHits(
  buildings: Building[],
  polygons: Polygon[],
  search: string,
): SearchHit[] {
  const q = normalizeSearch(search)
  if (!q) return []

  const anyBuildingMeta = buildings.some((b) => buildingMetadataMatches(b, q))
  const hits: SearchHit[] = []

  if (!anyBuildingMeta) {
    for (const building of buildings) {
      for (const rtu of building.rtus ?? []) {
        if (
          rtu.name.toLowerCase().includes(q) ||
          (rtu.description ?? '').toLowerCase().includes(q)
        ) {
          hits.push({
            kind: 'rtu',
            label: `${building.address} · ${rtu.name}`,
            lat: rtu.lat,
            lng: rtu.lng,
            layerKey: 'rtu',
            detailName: rtu.name,
            buildingAddress: building.address,
          })
        }
      }
    }

    for (const polygon of polygons) {
      if (
        polygon.name.toLowerCase().includes(q) ||
        (polygon.description ?? '').toLowerCase().includes(q)
      ) {
        const { lat, lng } = polygonCentroid(polygon)
        hits.push({
          kind: 'polygon',
          label: polygon.description
            ? `${polygon.name} · ${polygon.description}`
            : polygon.name,
          lat,
          lng,
          polygonName: polygon.name,
          polygonDescription: polygon.description,
        })
      }
    }
  }

  if (hits.length === 0) {
    for (const building of buildings) {
      if (buildingMetadataMatches(building, q)) {
        hits.push({
          kind: 'building',
          label: building.address,
          lat: building.lat,
          lng: building.lng,
          address: building.address,
        })
      }
    }
  }

  return hits
}

export function openSearchHit(hit: SearchHit): void {
  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent('map:panTo', { detail: { lat: hit.lat, lng: hit.lng, zoom: MAP_DETAIL_ZOOM } }),
    )

    if (hit.kind === 'rtu' && hit.layerKey && hit.detailName) {
      window.dispatchEvent(
        new CustomEvent('map:openDetail', {
          detail: {
            layerKey: hit.layerKey,
            name: hit.detailName,
            buildingAddress: hit.buildingAddress,
          },
        }),
      )
      return
    }

    if (hit.kind === 'polygon' && hit.polygonName !== undefined) {
      window.dispatchEvent(
        new CustomEvent('map:openPolygon', {
          detail: {
            name: hit.polygonName,
            description: hit.polygonDescription ?? '',
          },
        }),
      )
      return
    }

    if (hit.kind === 'building' && hit.address) {
      window.dispatchEvent(
        new CustomEvent('map:openBuilding', {
          detail: { address: hit.address },
        }),
      )
    }
  })
}
