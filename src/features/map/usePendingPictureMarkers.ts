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
  dragListener: google.maps.MapsEventListener
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

function detachMarker(marker: AppMapMarker): void {
  setAppMarkerMap(marker, null)
}

export function usePendingPictureMarkers(
  map: google.maps.Map | null,
  buildings: Building[],
): void {
  const items = usePendingRtuPictureStore((s) => s.items)
  const markersRef = useRef<Map<string, PictureMarkerEntry>>(new Map())
  const buildingsRef = useRef(buildings)
  const assignToRtuRef = useRef(usePendingRtuPictureStore.getState().assignToRtu)
  const updatePositionRef = useRef(usePendingRtuPictureStore.getState().updatePosition)

  useEffect(() => {
    assignToRtuRef.current = usePendingRtuPictureStore.getState().assignToRtu
    updatePositionRef.current = usePendingRtuPictureStore.getState().updatePosition
  })

  useEffect(() => {
    buildingsRef.current = buildings
  }, [buildings])

  useEffect(() => {
    if (!map) {
      for (const entry of markersRef.current.values()) {
        google.maps.event.removeListener(entry.dragListener)
        detachMarker(entry.marker)
      }
      markersRef.current.clear()
      return
    }

    const itemIds = new Set(items.map((item) => item.id))

    for (const [id, entry] of [...markersRef.current.entries()]) {
      if (itemIds.has(id)) continue
      google.maps.event.removeListener(entry.dragListener)
      detachMarker(entry.marker)
      markersRef.current.delete(id)
    }

    for (const item of items) {
      const existing = markersRef.current.get(item.id)
      if (existing) {
        setAppMarkerMap(existing.marker, map)
        const pos = getAppMarkerPosition(existing.marker)
        if (!pos || pos.lat() !== item.lat || pos.lng() !== item.lng) {
          setAppMarkerPosition(existing.marker, item.lat, item.lng)
        }
        continue
      }

      const pendingId = item.id
      const originalName = item.originalName
      const marker = createAppMarker({
        map,
        position: { lat: item.lat, lng: item.lng },
        draggable: true,
        title: `Photo: ${item.originalName} — drag onto RTU marker`,
        icon: pictureMarkerIcon(),
        zIndex: 2000,
      })

      const dragListener = addAppMarkerListener(marker, 'dragend', () => {
        const pos = getAppMarkerPosition(marker)
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()

        const match = findNearestRtuAt(buildingsRef.current, lat, lng, RTU_PICTURE_DROP_FEET)
        if (!match) {
          updatePositionRef.current(pendingId, lat, lng)
          showToastError(
            `Drop closer to an RTU marker (within ${RTU_PICTURE_DROP_FEET} ft) to assign this photo.`,
          )
          return
        }

        void assignToRtuRef
          .current(pendingId, match.building, match.rtu)
          .then((result) => {
            showToastSuccess(
              `✓ Assigned ${originalName} → ${result.fileName} (${match.rtu.name})`,
            )
          })
          .catch((error) => {
            updatePositionRef.current(pendingId, lat, lng)
            showToastError(error instanceof Error ? error.message : 'Failed to assign picture')
          })
      })

      markersRef.current.set(item.id, { id: item.id, marker, dragListener })
    }
  }, [map, items])

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup must read latest ref
      const markers = markersRef.current
      for (const entry of markers.values()) {
        google.maps.event.removeListener(entry.dragListener)
        detachMarker(entry.marker)
      }
      markers.clear()
    }
  }, [])
}
