import { useCallback, useEffect, useRef } from 'react'
import { polygonDragKey, buildGroupDragSnapshot, applySnapshotToPortfolio } from '@/lib/dragSelection'
import {
  applyGroupDragDelta,
  beginGroupDrag,
  endGroupDrag,
  isGroupDragActive,
  registerGroupDragVisuals,
  setNativeDragPolygonKey,
} from '@/lib/mapGroupDragSession'
import { afterMapViewChange, panToPreserveRotation } from '@/lib/mapRotation'
import { consumeMapClickClearSuppression, registerMarqueeTarget, unregisterMarqueeTarget } from '@/lib/mapMarqueeSelect'
import { closeAllMapPopups, MAP_CLOSE_POPUPS_EVENT } from '@/lib/mapPopups'
import { showToastSuccess } from '@/lib/toast'
import { useLayerStore } from '@/stores/layerStore'
import { useSelectionStore } from '@/stores/selectionStore'
import type { Building, Polygon, Utility } from '@/types/domain'

export interface UsePolygonsOptions {
  map: google.maps.Map | null
  buildings: Building[]
  utilities: Utility[]
  polygons: Polygon[]
  onPolygonUpdated?: (polygon: Polygon) => void
  onPolygonDeleted?: (polygon: Polygon) => void
  onGroupMoved?: (data: { buildings: Building[]; utilities: Utility[]; polygons: Polygon[] }) => void
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
  return polygonDragKey(data.name, data.description)
}

function polygonCentroid(data: Polygon): { lat: number; lng: number } {
  const lats = data.paths.reduce((s, pt) => s + pt.lat, 0)
  const lngs = data.paths.reduce((s, pt) => s + pt.lng, 0)
  return { lat: lats / data.paths.length, lng: lngs / data.paths.length }
}

export function usePolygons({
  map,
  buildings,
  utilities,
  polygons,
  onPolygonUpdated,
  onPolygonDeleted,
  onGroupMoved,
}: UsePolygonsOptions) {
  const dragMode = useSelectionStore((s) => s.dragMode)
  const dragSelectedKeys = useSelectionStore((s) => s.dragSelectedKeys)
  const polygonsLayerVisible = useLayerStore((s) => s.layers.polygons)
  const setLastDragUndo = useSelectionStore((s) => s.setLastDragUndo)

  const portfolioRef = useRef({ buildings, utilities, polygons })

  useEffect(() => {
    portfolioRef.current = { buildings, utilities, polygons }
  }, [buildings, utilities, polygons])
  const renderedRef = useRef<RenderedPolygon[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const infoPolyRef = useRef<google.maps.Polygon | null>(null)
  const editingRef = useRef<{ poly: google.maps.Polygon; data: Polygon } | null>(null)
  const movingRef = useRef<{ poly: google.maps.Polygon; data: Polygon } | null>(null)
  const editDblListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  const resolveGroupKeys = useCallback((anchorKey: string) => {
    const selected = useSelectionStore.getState().dragSelectedKeys
    if (selected.length > 0 && selected.includes(anchorKey)) return selected
    return [anchorKey]
  }, [])

  const commitGroupDrag = useCallback(() => {
    const finalSnapshot = endGroupDrag()
    if (!finalSnapshot || !onGroupMoved) return
    onGroupMoved(applySnapshotToPortfolio(portfolioRef.current, finalSnapshot))
    showToastSuccess('✓ Positions updated — save to HTML to keep changes.')
  }, [onGroupMoved])

  const beginDragSession = useCallback(
    (anchorKey: string, startLat: number, startLng: number) => {
      const keys = resolveGroupKeys(anchorKey)
      const portfolio = portfolioRef.current
      const beforeSnapshot = buildGroupDragSnapshot(portfolio, keys)
      if (keys.length > 1) {
        beginGroupDrag({ lat: startLat, lng: startLng }, beforeSnapshot)
        setLastDragUndo(() => {
          onGroupMoved?.(applySnapshotToPortfolio(portfolio, beforeSnapshot))
        })
      }
    },
    [onGroupMoved, resolveGroupKeys, setLastDragUndo],
  )

  useEffect(() => {
    registerGroupDragVisuals({
      setPolygonPaths: (key, paths) => {
        const entry = renderedRef.current.find((r) => polygonKey(r.data) === key)
        if (!entry) return
        entry.gmPoly.setPath(paths)
      },
    })
    return () => {
      registerGroupDragVisuals({ setPolygonPaths: undefined })
    }
  }, [])

  const refreshPolygonSelectionStyles = useCallback(() => {
    const selected = new Set(useSelectionStore.getState().dragSelectedKeys)
    for (const entry of renderedRef.current) {
      const key = polygonKey(entry.data)
      const isSelected = selected.has(key)
      entry.gmPoly.setOptions({
        strokeWeight: isSelected ? 4 : 2,
        fillOpacity: isSelected ? 0.15 : 0.02,
        strokeColor: isSelected ? '#ffffff' : entry.data.color,
      })
    }
  }, [])

  useEffect(() => {
    refreshPolygonSelectionStyles()
  }, [dragMode, dragSelectedKeys, refreshPolygonSelectionStyles])

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
    return updated
  }, [])

  const clearEditListeners = useCallback(() => {
    if (editDblListenerRef.current) {
      google.maps.event.removeListener(editDblListenerRef.current)
      editDblListenerRef.current = null
    }
  }, [])

  const setEditButtonLabel = useCallback((data: Polygon, isEditing: boolean) => {
    const esc = (t: string) => t.replace(/</g, '&lt;').replace(/"/g, '&quot;')
    const editBtn = document.querySelector(
      `[data-poly-actions="${esc(polygonKey(data))}"] [data-poly-action="edit"]`,
    )
    if (editBtn) {
      editBtn.textContent = isEditing ? '✏ Edit Off' : '✏ Edit Points'
    }
  }, [])

  const stopEdit = useCallback(
    (options?: { silent?: boolean }) => {
      const entry = editingRef.current
      if (!entry) return
      entry.poly.setEditable(false)
      syncPaths(entry.poly, entry.data)
      clearEditListeners()
      editingRef.current = null
      setEditButtonLabel(entry.data, false)
      if (!options?.silent) {
        showToastSuccess('✓ Edit saved — save to HTML to keep changes.')
      }
    },
    [clearEditListeners, setEditButtonLabel, syncPaths],
  )

  const stopMove = useCallback(() => {
    const entry = movingRef.current
    if (!entry) return
    entry.poly.setDraggable(false)
    entry.poly.setOptions({ fillOpacity: 0.02 })
    syncPaths(entry.poly, entry.data)
    movingRef.current = null
  }, [syncPaths])

  const startEdit = useCallback(
    (poly: google.maps.Polygon, data: Polygon) => {
      if (editingRef.current?.poly === poly) return
      if (editingRef.current) stopEdit({ silent: true })
      if (movingRef.current) stopMove()
      editingRef.current = { poly, data }
      poly.setEditable(true)
      setEditButtonLabel(data, true)
      showToastSuccess('Edit mode — drag vertices. Click Edit Off when done.')

      editDblListenerRef.current = poly.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        e.stop()
        stopEdit()
      })
    },
    [setEditButtonLabel, stopEdit, stopMove],
  )

  const openPopup = useCallback(
    (poly: google.maps.Polygon, data: Polygon, latLng?: google.maps.LatLng) => {
      if (!map) return
      if (editingRef.current && editingRef.current.poly !== poly) {
        stopEdit({ silent: true })
      }
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
      const isEditing = editingRef.current?.poly === poly
      const content = `<div class="iw"><div class="iw-head"><div class="iw-name">${esc(data.name || 'Polygon')}</div></div>${
        data.description
          ? `<div class="iw-row" style="margin-top:6px;white-space:pre-wrap">${esc(data.description)}</div>`
          : ''
      }<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap" data-poly-actions="${actionKey}">
        <button data-poly-action="edit" style="font-size:11px;padding:4px 10px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer">${isEditing ? '✏ Edit Off' : '✏ Edit Points'}</button>
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
          if (editingRef.current?.poly === poly) stopEdit({ silent: true })
          poly.setMap(null)
          renderedRef.current = renderedRef.current.filter((r) => r.gmPoly !== poly)
          infoWindowRef.current?.close()
          callbacksRef.current.onPolygonDeleted?.(data)
          showToastSuccess('✓ Polygon deleted — save to HTML to keep changes.')
        })
        root.querySelector('[data-poly-action="edit"]')?.addEventListener('click', () => {
          if (editingRef.current?.poly === poly) {
            stopEdit()
            return
          }
          startEdit(poly, data)
        })
        root.querySelector('[data-poly-action="move"]')?.addEventListener('click', () => {
          infoWindowRef.current?.close()
          stopEdit({ silent: true })
          movingRef.current = { poly, data }
          poly.setDraggable(true)
          poly.setOptions({ fillOpacity: 0.15 })
          showToastSuccess('Move mode — drag polygon, dbl-click to finish.')
        })
      })
    },
    [map, startEdit, stopEdit, stopMove],
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
      const key = polygonKey(p)
      const gmPoly = new google.maps.Polygon({
        paths: p.paths,
        strokeColor: p.color,
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: p.color,
        fillOpacity: 0.02,
        map,
        visible: polygonsLayerVisible,
        zIndex: 40,
        draggable: false,
      })

      gmPoly.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (useSelectionStore.getState().dragMode) {
          e.stop()
          const domEvent = e.domEvent as MouseEvent | undefined
          const additive = Boolean(domEvent?.ctrlKey || domEvent?.metaKey || domEvent?.shiftKey)
          useSelectionStore.getState().toggleDragSelect(key, additive)
          refreshPolygonSelectionStyles()
          return
        }
        closeAllMapPopups()
      })

      gmPoly.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        if (useSelectionStore.getState().dragMode) return
        e.stop()
        if (editingRef.current?.poly === gmPoly) {
          stopEdit()
          return
        }
        openPopupRef.current(gmPoly, p, e.latLng ?? undefined)
      })

      gmPoly.addListener('dragstart', () => {
        if (movingRef.current?.poly === gmPoly) return
        if (!useSelectionStore.getState().dragMode) return
        const start = polygonCentroid(p)
        beginDragSession(key, start.lat, start.lng)
        if (isGroupDragActive()) {
          setNativeDragPolygonKey(key)
        }
      })

      gmPoly.addListener('drag', () => {
        if (movingRef.current?.poly === gmPoly) return
        if (!isGroupDragActive()) return
        const path = gmPoly.getPath()
        let latSum = 0
        let lngSum = 0
        const count = path.getLength()
        for (let i = 0; i < count; i++) {
          const pt = path.getAt(i)
          latSum += pt.lat()
          lngSum += pt.lng()
        }
        if (!count) return
        applyGroupDragDelta({ lat: latSum / count, lng: lngSum / count })
      })

      gmPoly.addListener('dragend', () => {
        setNativeDragPolygonKey(null)
        if (movingRef.current?.poly === gmPoly) {
          stopMove()
          return
        }
        if (isGroupDragActive()) {
          commitGroupDrag()
          return
        }
        if (useSelectionStore.getState().dragMode) {
          syncPaths(gmPoly, p)
        }
      })

      renderedRef.current.push({ data: p, gmPoly })
      registerMarqueeTarget(key, {
        kind: 'polygon',
        resolve: () => {
          const path = gmPoly.getPath()
          const paths: Array<{ lat: number; lng: number }> = []
          for (let i = 0; i < path.getLength(); i++) {
            const pt = path.getAt(i)
            paths.push({ lat: pt.lat(), lng: pt.lng() })
          }
          return paths
        },
      })
    }

    refreshPolygonSelectionStyles()

    return () => {
      for (const entry of renderedRef.current) {
        unregisterMarqueeTarget(polygonKey(entry.data))
        entry.gmPoly.setMap(null)
      }
      renderedRef.current = []
      infoWindowRef.current?.close()
      editingRef.current = null
      movingRef.current = null
      clearEditListeners()
    }
  }, [map, polygons, polygonsLayerVisible, refreshPolygonSelectionStyles, beginDragSession, commitGroupDrag, stopMove, stopEdit, syncPaths, clearEditListeners])

  useEffect(() => {
    for (const entry of renderedRef.current) {
      const key = polygonKey(entry.data)
      const selected = useSelectionStore.getState().isDragSelected(key)
      const popupMoving = movingRef.current?.poly === entry.gmPoly
      entry.gmPoly.setDraggable((dragMode && selected) || popupMoving)
    }
  }, [dragMode, dragSelectedKeys])

  useEffect(() => {
    for (const entry of renderedRef.current) {
      entry.gmPoly.setVisible(polygonsLayerVisible)
    }
    if (!polygonsLayerVisible) {
      infoWindowRef.current?.close()
      infoWindowRef.current = null
      infoPolyRef.current = null
    }
  }, [polygonsLayerVisible])

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
    const listener = map.addListener('click', () => {
      if (consumeMapClickClearSuppression()) return
      if (useSelectionStore.getState().dragMode) {
        useSelectionStore.getState().clearDragSelect()
        refreshPolygonSelectionStyles()
      }
      closeAllMapPopups()
    })
    return () => google.maps.event.removeListener(listener)
  }, [map, refreshPolygonSelectionStyles])
}
