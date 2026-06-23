import { useCallback, useEffect, useRef } from 'react'
import { afterMapViewChange, panToPreserveRotation } from '@/lib/mapRotation'
import { closeAllMapPopups, MAP_CLOSE_POPUPS_EVENT } from '@/lib/mapPopups'
import { showToastSuccess } from '@/lib/toast'
import type { Polygon } from '@/types/domain'

export interface UsePolygonsOptions {
  map: google.maps.Map | null
  polygons: Polygon[]
  onPolygonUpdated?: (polygon: Polygon) => void
  onPolygonDeleted?: (polygon: Polygon) => void
}

interface RenderedPolygon {
  data: Polygon
  gmPoly: google.maps.Polygon
}

function panToPolygon(map: google.maps.Map, data: Polygon) {
  const lats = data.paths.reduce((s, pt) => s + pt.lat, 0)
  const lngs = data.paths.reduce((s, pt) => s + pt.lng, 0)
  panToPreserveRotation(
    map,
    { lat: lats / data.paths.length, lng: lngs / data.paths.length },
    21,
  )
}

function polygonKey(data: Polygon): string {
  return `${data.name}\0${data.description}`
}

export function usePolygons({
  map,
  polygons,
  onPolygonUpdated,
  onPolygonDeleted,
}: UsePolygonsOptions) {
  const renderedRef = useRef<RenderedPolygon[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const infoPolyRef = useRef<google.maps.Polygon | null>(null)
  const editingRef = useRef<{ poly: google.maps.Polygon; data: Polygon } | null>(null)
  const movingRef = useRef<{ poly: google.maps.Polygon; data: Polygon } | null>(null)
  const callbacksRef = useRef({ onPolygonUpdated, onPolygonDeleted })

  const syncPaths = useCallback((poly: google.maps.Polygon, data: Polygon) => {
    const path = poly.getPath()
    const paths: Polygon['paths'] = []
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i)
      paths.push({ lat: pt.lat(), lng: pt.lng() })
    }
    const updated = { ...data, paths }
    callbacksRef.current.onPolygonUpdated?.(updated)
  }, [])

  const stopEdit = useCallback(() => {
    const entry = editingRef.current
    if (!entry) return
    entry.poly.setEditable(false)
    syncPaths(entry.poly, entry.data)
    editingRef.current = null
  }, [syncPaths])

  const stopMove = useCallback(() => {
    const entry = movingRef.current
    if (!entry) return
    entry.poly.setDraggable(false)
    entry.poly.setOptions({ fillOpacity: 0.02 })
    syncPaths(entry.poly, entry.data)
    movingRef.current = null
  }, [syncPaths])

  const openPopup = useCallback(
    (poly: google.maps.Polygon, data: Polygon, latLng?: google.maps.LatLng) => {
      if (!map) return
      if (infoWindowRef.current && infoPolyRef.current === poly) {
        closeAllMapPopups()
        return
      }

      closeAllMapPopups()

      let position = latLng
      if (!position) {
        const lats = data.paths.reduce((s, pt) => s + pt.lat, 0)
        const lngs = data.paths.reduce((s, pt) => s + pt.lng, 0)
        position = new google.maps.LatLng(lats / data.paths.length, lngs / data.paths.length)
      }

      const esc = (t: string) => t.replace(/</g, '&lt;').replace(/"/g, '&quot;')
      const actionKey = esc(polygonKey(data))
      const content = `<div class="iw"><div class="iw-head"><div class="iw-name">${esc(data.name || 'Polygon')}</div></div>${
        data.description
          ? `<div class="iw-row" style="margin-top:6px;white-space:pre-wrap">${esc(data.description)}</div>`
          : ''
      }<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap" data-poly-actions="${actionKey}">
        <button data-poly-action="edit" style="font-size:11px;padding:4px 10px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer">✏ Edit Points</button>
        <button data-poly-action="move" style="font-size:11px;padding:4px 10px;background:#059669;color:#fff;border:none;border-radius:4px;cursor:pointer">↔ Move</button>
        <button data-poly-action="delete" style="font-size:11px;padding:4px 10px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer">🗑 Delete</button>
      </div></div>`

      infoWindowRef.current = new google.maps.InfoWindow({
        content,
        position,
        disableAutoPan: true,
      })
      infoPolyRef.current = poly
      infoWindowRef.current.open({ map, shouldFocus: false })
      afterMapViewChange(map)

      google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
        const root = document.querySelector(`[data-poly-actions="${actionKey}"]`)
        if (!root) return
        root.querySelector('[data-poly-action="delete"]')?.addEventListener('click', () => {
          poly.setMap(null)
          renderedRef.current = renderedRef.current.filter((r) => r.gmPoly !== poly)
          infoWindowRef.current?.close()
          callbacksRef.current.onPolygonDeleted?.(data)
          showToastSuccess('✓ Polygon deleted — save to HTML to keep changes.')
        })
        root.querySelector('[data-poly-action="edit"]')?.addEventListener('click', () => {
          infoWindowRef.current?.close()
          if (movingRef.current) stopMove()
          editingRef.current = { poly, data }
          poly.setEditable(true)
          showToastSuccess('Edit mode — drag vertices, dbl-click polygon again to finish.')
        })
        root.querySelector('[data-poly-action="move"]')?.addEventListener('click', () => {
          infoWindowRef.current?.close()
          if (editingRef.current) stopEdit()
          movingRef.current = { poly, data }
          poly.setDraggable(true)
          poly.setOptions({ fillOpacity: 0.15 })
          showToastSuccess('Move mode — drag polygon, dbl-click to finish.')
        })
      })
    },
    [map, stopEdit, stopMove],
  )

  const openPopupRef = useRef(openPopup)

  useEffect(() => {
    callbacksRef.current = { onPolygonUpdated, onPolygonDeleted }
  }, [onPolygonUpdated, onPolygonDeleted])

  useEffect(() => {
    openPopupRef.current = openPopup
  }, [openPopup])

  useEffect(() => {
    if (!map) return

    const onOpenPolygon = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; description: string }>).detail
      const key = polygonKey({ name: detail.name, description: detail.description, color: '', paths: [] })
      const entry = renderedRef.current.find((r) => polygonKey(r.data) === key)
      if (!entry) return
      panToPolygon(map, entry.data)
      openPopupRef.current(entry.gmPoly, entry.data)
    }

    window.addEventListener('map:openPolygon', onOpenPolygon)
    return () => window.removeEventListener('map:openPolygon', onOpenPolygon)
  }, [map])

  useEffect(() => {
    if (!map) return

    for (const entry of renderedRef.current) {
      entry.gmPoly.setMap(null)
    }
    renderedRef.current = []
    infoWindowRef.current?.close()
    infoWindowRef.current = null
    infoPolyRef.current = null

    for (const p of polygons) {
      if (p.paths.length < 3) continue
      const gmPoly = new google.maps.Polygon({
        paths: p.paths,
        strokeColor: p.color,
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: p.color,
        fillOpacity: 0.02,
        map,
        zIndex: 40,
      })

      gmPoly.addListener('click', () => {
        closeAllMapPopups()
      })

      gmPoly.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        e.stop()
        openPopupRef.current(gmPoly, p, e.latLng ?? undefined)
      })

      renderedRef.current.push({ data: p, gmPoly })
    }

    return () => {
      for (const entry of renderedRef.current) {
        entry.gmPoly.setMap(null)
      }
      renderedRef.current = []
      infoWindowRef.current?.close()
      editingRef.current = null
      movingRef.current = null
    }
  }, [map, polygons])

  useEffect(() => {
    const closePopups = () => {
      infoWindowRef.current?.close()
      infoWindowRef.current = null
      infoPolyRef.current = null
    }
    window.addEventListener(MAP_CLOSE_POPUPS_EVENT, closePopups)
    return () => window.removeEventListener(MAP_CLOSE_POPUPS_EVENT, closePopups)
  }, [])

  useEffect(() => {
    if (!map) return
    const listener = map.addListener('click', closeAllMapPopups)
    return () => google.maps.event.removeListener(listener)
  }, [map])
}
