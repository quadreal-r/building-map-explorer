import { useEffect, useRef } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'
import { canPersistToSupabase, deletePolygon, upsertPolygon } from '@/lib/portfolioApi'
import type { Polygon } from '@/types/domain'

export interface UsePolygonsOptions {
  map: google.maps.Map | null
  polygons: Polygon[]
  onPolygonUpdated?: (polygon: Polygon) => void
  onPolygonDeleted?: (id: number) => void
}

export function usePolygons({
  map,
  polygons,
  onPolygonUpdated,
  onPolygonDeleted,
}: UsePolygonsOptions) {
  const { isAuthenticated } = useAuthContext()
  const polygonRefs = useRef<{ poly: google.maps.Polygon; data: Polygon }[]>([])

  useEffect(() => {
    if (!map) return

    for (const entry of polygonRefs.current) {
      entry.poly.setMap(null)
    }
    polygonRefs.current = []

    for (const p of polygons) {
      if (p.paths.length < 3) continue
      const poly = new google.maps.Polygon({
        paths: p.paths,
        strokeColor: p.color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: p.color,
        fillOpacity: 0.25,
        map,
        editable: isAuthenticated,
        draggable: isAuthenticated,
      })

      poly.addListener('mouseup', () => {
        const path = poly.getPath()
        const paths: Polygon['paths'] = []
        for (let i = 0; i < path.getLength(); i++) {
          const pt = path.getAt(i)
          paths.push({ lat: pt.lat(), lng: pt.lng() })
        }
        const updated = { ...p, paths }
        onPolygonUpdated?.(updated)
        if (canPersistToSupabase(isAuthenticated)) {
          void upsertPolygon(updated).catch(console.error)
        }
      })

      poly.addListener('rightclick', (e: google.maps.MapMouseEvent) => {
        if (!isAuthenticated) return
        e.stop()
        poly.setMap(null)
        if (p.id) {
          onPolygonDeleted?.(p.id)
          if (canPersistToSupabase(isAuthenticated)) {
            void deletePolygon(p.id).catch(console.error)
          }
        }
      })

      polygonRefs.current.push({ poly, data: p })
    }

    return () => {
      for (const entry of polygonRefs.current) {
        entry.poly.setMap(null)
      }
      polygonRefs.current = []
    }
  }, [map, polygons, isAuthenticated, onPolygonUpdated, onPolygonDeleted])
}
