import { useEffect, useRef } from 'react'
import {
  addAppMarkerListener,
  createAppMarker,
  getAppMarkerPosition,
  setAppMarkerMap,
  setAppMarkerPosition,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import { findNearestRtuAt, RTU_PICTURE_DROP_FEET } from '@/lib/rtuPictureGpsAssign'
import { showToastError, showToastSuccess } from '@/lib/toast'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import type { Building } from '@/types/domain'

interface PictureMarkerEntry {
  id: string
  marker: AppMapMarker
}

function pictureMarkerIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#e879f9',
    fillOpacity: 0.95,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 11,
  }
}

export function usePendingPictureMarkers(
  map: google.maps.Map | null,
  buildings: Building[],
): void {
  const items = usePendingRtuPictureStore((s) => s.items)
  const updatePosition = usePendingRtuPictureStore((s) => s.updatePosition)
  const assignToRtu = usePendingRtuPictureStore((s) => s.assignToRtu)
  const markersRef = useRef<PictureMarkerEntry[]>([])
  const buildingsRef = useRef(buildings)

  useEffect(() => {
    buildingsRef.current = buildings
  }, [buildings])

  useEffect(() => {
    if (!map) return

    const byId = new Map(markersRef.current.map((entry) => [entry.id, entry.marker]))
    const next: PictureMarkerEntry[] = []

    for (const item of items) {
      let marker = byId.get(item.id)
      if (!marker) {
        const pendingId = item.id
        const originalName = item.originalName
        marker = createAppMarker({
          map,
          position: { lat: item.lat, lng: item.lng },
          draggable: true,
          title: `Photo: ${item.originalName} — drag onto RTU marker`,
          icon: pictureMarkerIcon(),
          zIndex: 2000,
        })

        addAppMarkerListener(marker, 'dragend', () => {
          const pos = getAppMarkerPosition(marker!)
          if (!pos) return
          const lat = pos.lat()
          const lng = pos.lng()
          updatePosition(pendingId, lat, lng)

          const match = findNearestRtuAt(buildingsRef.current, lat, lng, RTU_PICTURE_DROP_FEET)
          if (!match) {
            showToastError(
              `Drop closer to an RTU marker (within ${RTU_PICTURE_DROP_FEET} ft) to assign this photo.`,
            )
            return
          }

          void assignToRtu(pendingId, match.building, match.rtu)
            .then((result) => {
              showToastSuccess(
                `✓ Assigned ${originalName} → ${result.fileName} (${match.rtu.name})`,
              )
            })
            .catch((error) => {
              showToastError(error instanceof Error ? error.message : 'Failed to assign picture')
            })
        })
      } else {
        setAppMarkerMap(marker, map)
        const pos = getAppMarkerPosition(marker)
        if (!pos || pos.lat() !== item.lat || pos.lng() !== item.lng) {
          setAppMarkerPosition(marker, item.lat, item.lng)
        }
      }

      next.push({ id: item.id, marker })
      byId.delete(item.id)
    }

    for (const orphan of byId.values()) {
      setAppMarkerMap(orphan, null)
    }

    markersRef.current = next

    return () => {
      for (const entry of markersRef.current) {
        setAppMarkerMap(entry.marker, null)
      }
      markersRef.current = []
    }
  }, [map, items, updatePosition, assignToRtu])
}
