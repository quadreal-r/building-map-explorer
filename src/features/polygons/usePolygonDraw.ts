import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createAppMarker,
  setAppMarkerIcon,
  setAppMarkerMap,
  setAppMarkerPosition,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import type { LatLng } from '@/types/domain'

export interface UsePolygonDrawOptions {
  map: google.maps.Map | null
  color: string
}

function pointMarkerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  }
}

export function usePolygonDraw({ map, color }: UsePolygonDrawOptions) {
  const [points, setPoints] = useState<LatLng[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const closingLineRef = useRef<google.maps.Polyline | null>(null)
  const fillPreviewRef = useRef<google.maps.Polygon | null>(null)
  const pointMarkersRef = useRef<AppMapMarker[]>([])
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null)

  const clearPreviewLines = useCallback(() => {
    polylineRef.current?.setMap(null)
    polylineRef.current = null
    closingLineRef.current?.setMap(null)
    closingLineRef.current = null
    fillPreviewRef.current?.setMap(null)
    fillPreviewRef.current = null
  }, [])

  const clearPointMarkers = useCallback(() => {
    for (const marker of pointMarkersRef.current) {
      setAppMarkerMap(marker, null)
    }
    pointMarkersRef.current = []
  }, [])

  const syncPointMarkers = useCallback(
    (nextPoints: LatLng[]) => {
      if (!map) return
      while (pointMarkersRef.current.length > nextPoints.length) {
        const removed = pointMarkersRef.current.pop()
        if (removed) setAppMarkerMap(removed, null)
      }
      nextPoints.forEach((point, index) => {
        let marker = pointMarkersRef.current[index]
        if (!marker) {
          marker = createAppMarker({
            map,
            position: point,
            zIndex: 55,
            clickable: false,
            icon: pointMarkerIcon(color),
          })
          pointMarkersRef.current[index] = marker
          return
        }
        setAppMarkerPosition(marker, point.lat, point.lng)
        setAppMarkerIcon(marker, pointMarkerIcon(color))
        setAppMarkerMap(marker, map)
      })
    },
    [color, map],
  )

  const updatePreview = useCallback(
    (nextPoints: LatLng[]) => {
      if (!map) return
      syncPointMarkers(nextPoints)
      clearPreviewLines()
      if (nextPoints.length > 1) {
        polylineRef.current = new google.maps.Polyline({
          path: nextPoints,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          map,
          zIndex: 50,
        })
      }
      if (nextPoints.length >= 3) {
        const last = nextPoints[nextPoints.length - 1]!
        const first = nextPoints[0]!
        closingLineRef.current = new google.maps.Polyline({
          path: [last, first],
          strokeColor: color,
          strokeOpacity: 0.35,
          strokeWeight: 1.5,
          map,
          zIndex: 49,
        })
        fillPreviewRef.current = new google.maps.Polygon({
          paths: nextPoints,
          strokeOpacity: 0,
          fillColor: color,
          fillOpacity: 0.15,
          map,
          zIndex: 48,
          clickable: false,
        })
      }
    },
    [clearPreviewLines, color, map, syncPointMarkers],
  )

  const stopListeners = useCallback(() => {
    setIsDrawing(false)
    clickListenerRef.current?.remove()
    clickListenerRef.current = null
  }, [])

  const reset = useCallback(() => {
    stopListeners()
    setPoints([])
    clearPreviewLines()
    clearPointMarkers()
  }, [clearPointMarkers, clearPreviewLines, stopListeners])

  const startDrawing = useCallback(() => {
    if (!map) return
    reset()
    setIsDrawing(true)
    clickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng
      if (!latLng) return
      const next = { lat: latLng.lat(), lng: latLng.lng() }
      setPoints((prev) => {
        const updated = [...prev, next]
        updatePreview(updated)
        return updated
      })
    })
  }, [map, reset, updatePreview])

  useEffect(() => {
    if (points.length > 0) {
      updatePreview(points)
    }
  }, [color, points, updatePreview])

  useEffect(() => () => reset(), [reset])

  return {
    points,
    isDrawing,
    startDrawing,
    stopDrawing: stopListeners,
    reset,
    setPoints,
  }
}
