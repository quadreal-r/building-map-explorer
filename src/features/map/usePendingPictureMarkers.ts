import { useEffect, useRef } from 'react'
import {
  clearAllPendingPictureMarkers,
  syncPendingPictureMarkers,
} from '@/features/map/pendingPictureMarkerRegistry'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import type { Building } from '@/types/domain'

export function usePendingPictureMarkers(
  map: google.maps.Map | null,
  buildings: Building[],
): void {
  const items = usePendingRtuPictureStore((s) => s.items)
  const stageRevision = usePendingRtuPictureStore((s) => s.stageRevision)
  const buildingsRef = useRef(buildings)
  const handlersRef = useRef({
    updatePosition: usePendingRtuPictureStore.getState().updatePosition,
    assignToRtu: usePendingRtuPictureStore.getState().assignToRtu,
  })

  useEffect(() => {
    handlersRef.current = {
      updatePosition: usePendingRtuPictureStore.getState().updatePosition,
      assignToRtu: usePendingRtuPictureStore.getState().assignToRtu,
    }
  })

  useEffect(() => {
    buildingsRef.current = buildings
  }, [buildings])

  useEffect(() => {
    syncPendingPictureMarkers(
      map,
      items,
      () => buildingsRef.current,
      handlersRef.current,
    )
  }, [map, items, stageRevision])

  useEffect(() => {
    return () => {
      clearAllPendingPictureMarkers()
    }
  }, [])
}
