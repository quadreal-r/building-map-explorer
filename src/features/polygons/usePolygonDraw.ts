import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '@/types/domain'

export interface UsePolygonDrawOptions {
  map: google.maps.Map | null
  color: string
}

export function usePolygonDraw({ map, color }: UsePolygonDrawOptions) {
  const [points, setPoints] = useState<LatLng[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const closingLineRef = useRef<google.maps.Polyline | null>(null)
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  const dblClickListenerRef = useRef<google.maps.MapsEventListener | null>(null)

  const clearPreview = useCallback(() => {
    polylineRef.current?.setMap(null)
    polylineRef.current = null
    closingLineRef.current?.setMap(null)
    closingLineRef.current = null
  }, [])

  const updatePreview = useCallback(
    (nextPoints: LatLng[]) => {
      if (!map) return
      clearPreview()
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
      }
    },
    [clearPreview, color, map],
  )

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
    clickListenerRef.current?.remove()
    clickListenerRef.current = null
    dblClickListenerRef.current?.remove()
    dblClickListenerRef.current = null
    clearPreview()
  }, [clearPreview])

  const reset = useCallback(() => {
    stopDrawing()
    setPoints([])
  }, [stopDrawing])

  const startDrawing = useCallback(() => {
    if (!map) return
    stopDrawing()
    setPoints([])
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
    dblClickListenerRef.current = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng
      if (!latLng) return
      setPoints((prev) => {
        const updated = [...prev, { lat: latLng.lat(), lng: latLng.lng() }]
        updatePreview(updated)
        return updated
      })
      setIsDrawing(false)
      clickListenerRef.current?.remove()
      clickListenerRef.current = null
      dblClickListenerRef.current?.remove()
      dblClickListenerRef.current = null
      clearPreview()
      return
    })
  }, [clearPreview, map, stopDrawing, updatePreview])

  const toggleDrawing = useCallback(() => {
    if (isDrawing) {
      stopDrawing()
      return
    }
    startDrawing()
  }, [isDrawing, startDrawing, stopDrawing])

  useEffect(() => {
    if (points.length > 0) {
      updatePreview(points)
    }
  }, [color, points, updatePreview])

  useEffect(() => () => stopDrawing(), [stopDrawing])

  return {
    points,
    isDrawing,
    startDrawing,
    stopDrawing,
    toggleDrawing,
    reset,
    setPoints,
  }
}
