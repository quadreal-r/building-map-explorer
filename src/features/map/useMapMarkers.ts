import { useCallback, useEffect, useRef } from 'react'
import { getColor } from '@/lib/colors'
import {
  ESRI_TILE_URL,
  IMAGERY_MODES,
  LAYER_COLORS,
  USGS_TILE_URL,
  UTILITY_LAYER_MAP,
} from '@/lib/constants'
import { afterMapViewChange, fitBoundsPreserveRotation, panToPreserveRotation } from '@/lib/mapRotation'
import { closeAllMapPopups, MAP_CLOSE_POPUPS_EVENT } from '@/lib/mapPopups'
import { collectSearchHits } from '@/lib/searchHits'
import { getMarkerIcon } from '@/lib/markerStyles'
import { buildBuildingInfoHtml, buildDetailInfoHtml, copyPopupText } from '@/lib/mapInfoWindow'
import { showToastSuccess } from '@/lib/toast'
import { useLayerStore } from '@/stores/layerStore'
import { useFilterStore } from '@/stores/filterStore'
import { useSelectionStore } from '@/stores/selectionStore'
import type { Building, LayerKey, Polygon, Rtu, Tenant, Utility } from '@/types/domain'

const TRANSPARENT_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

interface BuildingMarkerEntry {
  building: Building
  marker: google.maps.Marker
  label: google.maps.Marker
}

interface DetailMarkerEntry {
  type: LayerKey
  building: Building | null
  data: Rtu | Tenant | Utility
  marker: google.maps.Marker
  label?: google.maps.Marker
}

export interface UseMapMarkersOptions {
  map: google.maps.Map | null
  buildings: Building[]
  mapBuildings: Building[]
  utilities: Utility[]
  polygons: Polygon[]
  onSelectBuilding: (building: Building) => void
  onBuildingMoved?: (building: Building, lat: number, lng: number) => void
  onDetailMoved?: (layerKey: LayerKey, data: Rtu | Tenant | Utility, lat: number, lng: number, building: Building | null) => void
  onDeleteDetail?: (layerKey: LayerKey, data: Rtu | Tenant | Utility, building: Building | null) => void
}

export function useMapMarkers({
  map,
  buildings,
  mapBuildings,
  utilities,
  polygons,
  onSelectBuilding,
  onBuildingMoved,
  onDetailMoved,
  onDeleteDetail,
}: UseMapMarkersOptions) {
  const layers = useLayerStore((s) => s.layers)
  const search = useFilterStore((s) => s.search)
  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const dragMode = useSelectionStore((s) => s.dragMode)
  const setLastDragUndo = useSelectionStore((s) => s.setLastDragUndo)

  const buildingMarkersRef = useRef<BuildingMarkerEntry[]>([])
  const detailMarkersRef = useRef<DetailMarkerEntry[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const activeInfoMarkerRef = useRef<google.maps.Marker | null>(null)
  const imageryModeRef = useRef(0)
  const imageryOverlayRef = useRef<google.maps.ImageMapType | null>(null)
  const soloMoveRef = useRef<{ marker: google.maps.Marker; label?: google.maps.Marker } | null>(null)
  const soloMoveListenerRef = useRef<google.maps.MapsEventListener | null>(null)

  const callbacksRef = useRef({
    onSelectBuilding,
    onBuildingMoved,
    onDetailMoved,
    onDeleteDetail,
  })
  callbacksRef.current = { onSelectBuilding, onBuildingMoved, onDetailMoved, onDeleteDetail }

  const layersRef = useRef(layers)
  layersRef.current = layers

  const resetBuildingIcons = useCallback(() => {
    for (const entry of buildingMarkersRef.current) {
      const color = getColor(entry.building.park)
      entry.marker.setIcon(getMarkerIcon(color, false))
      entry.marker.setZIndex(10)
    }
  }, [])

  const highlightBuilding = useCallback(
    (building: Building) => {
      resetBuildingIcons()
      const entry = buildingMarkersRef.current.find((m) => m.building.address === building.address)
      if (!entry) return
      const color = getColor(building.park)
      entry.marker.setIcon(getMarkerIcon(color, true))
      entry.marker.setZIndex(999)
    },
    [resetBuildingIcons],
  )

  const openBuildingInfo = useCallback(
    (building: Building, marker: google.maps.Marker) => {
      if (!map || !infoWindowRef.current) return
      if (activeInfoMarkerRef.current === marker) {
        closeAllMapPopups()
        return
      }
      closeAllMapPopups()
      infoWindowRef.current.setContent(buildBuildingInfoHtml(building))
      infoWindowRef.current.open({ map, anchor: marker })
      activeInfoMarkerRef.current = marker
      afterMapViewChange(map)
    },
    [map],
  )

  const openDetailInfo = useCallback(
    (entry: DetailMarkerEntry) => {
      if (!map || !infoWindowRef.current) return
      const { type, data, building, marker } = entry
      if (activeInfoMarkerRef.current === marker) {
        closeAllMapPopups()
        return
      }
      closeAllMapPopups()
      infoWindowRef.current.setContent(
        buildDetailInfoHtml(type, data, { buildingAddress: building?.address }),
      )
      infoWindowRef.current.open({ map, anchor: marker })
      activeInfoMarkerRef.current = marker
      marker.setVisible(true)
      entry.label?.setVisible(true)
      afterMapViewChange(map)
    },
    [map],
  )

  const stopSoloMove = useCallback(() => {
    const solo = soloMoveRef.current
    if (!solo) return
    const globalDrag = useSelectionStore.getState().dragMode
    solo.marker.setDraggable(globalDrag)
    solo.marker.setCursor(globalDrag ? 'grab' : null)
    if (soloMoveListenerRef.current) {
      google.maps.event.removeListener(soloMoveListenerRef.current)
      soloMoveListenerRef.current = null
    }
    soloMoveRef.current = null
  }, [])

  const startSoloMove = useCallback(
    (marker: google.maps.Marker, label?: google.maps.Marker) => {
      stopSoloMove()
      infoWindowRef.current?.close()
      activeInfoMarkerRef.current = null
      soloMoveRef.current = { marker, label }
      marker.setDraggable(true)
      marker.setCursor('grab')
      showToastSuccess('↔ Drag marker to reposition.')
      soloMoveListenerRef.current = marker.addListener('dragend', () => {
        stopSoloMove()
        showToastSuccess('✓ Position updated — save to HTML to keep changes.')
      })
    },
    [stopSoloMove],
  )

  const attachInfoWindowActions = useCallback(() => {
    const iw = infoWindowRef.current
    if (!iw) return
    google.maps.event.addListenerOnce(iw, 'domready', () => {
      const container = document.querySelector('.gm-style-iw-d')
      if (!container) return
      container.querySelector('[data-iw-action="close"]')?.addEventListener('click', () => {
        iw.close()
        activeInfoMarkerRef.current = null
      })
      container.querySelector('[data-iw-action="copy-all"]')?.addEventListener('click', () => {
        const source = container.querySelector('.iw-copy-source') as HTMLTextAreaElement | null
        if (source?.value) copyPopupText(source.value)
      })
      container.querySelector('[data-iw-action="move"]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement
        const kind = btn.getAttribute('data-iw-kind')
        if (kind === 'building') {
          const address = btn.getAttribute('data-iw-address') ?? ''
          const entry = buildingMarkersRef.current.find((m) => m.building.address === address)
          if (!entry) return
          startSoloMove(entry.marker, entry.label)
          return
        }
        if (kind === 'detail') {
          const layerKey = btn.getAttribute('data-iw-layer') as LayerKey
          const name = btn.getAttribute('data-iw-name') ?? ''
          const buildingAddr = btn.getAttribute('data-iw-building') ?? ''
          const entry = detailMarkersRef.current.find(
            (dm) =>
              dm.type === layerKey &&
              dm.data.name === name &&
              (buildingAddr ? dm.building?.address === buildingAddr : !dm.building),
          )
          if (!entry) return
          startSoloMove(entry.marker, entry.label)
        }
      })
      const delBtn = container.querySelector('[data-iw-action="delete"]')
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          const layerKey = delBtn.getAttribute('data-iw-layer') as LayerKey
          const name = delBtn.getAttribute('data-iw-name') ?? ''
          const buildingAddr = delBtn.getAttribute('data-iw-building') ?? ''
          const entry = detailMarkersRef.current.find(
            (dm) =>
              dm.type === layerKey &&
              dm.data.name === name &&
              (buildingAddr ? dm.building?.address === buildingAddr : !dm.building),
          )
          if (!entry) return
          if (!window.confirm(`Delete marker "${name}"?`)) return
          iw.close()
          activeInfoMarkerRef.current = null
          callbacksRef.current.onDeleteDetail?.(entry.type, entry.data, entry.building)
        })
      }
    })
  }, [startSoloMove])

  const refreshDetailVisibility = useCallback(() => {
    if (!map) return
    const zoom = map.getZoom() ?? 0
    const bounds = map.getBounds()
    const activeLayers = layersRef.current
    for (const dm of detailMarkersRef.current) {
      const pos = dm.marker.getPosition()
      const show =
        activeLayers[dm.type] &&
        zoom >= 16 &&
        Boolean(bounds && pos && bounds.contains(pos))
      dm.marker.setVisible(show)
      dm.label?.setVisible(show)
    }
  }, [map])

  const fitAllMarkers = useCallback(() => {
    if (!map) return
    const bounds = new google.maps.LatLngBounds()
    const visibleSet = new Set(mapBuildings.map((b) => b.address))
    for (const entry of buildingMarkersRef.current) {
      if (!visibleSet.has(entry.building.address)) {
        entry.marker.setVisible(false)
        entry.label.setVisible(false)
        continue
      }
      entry.marker.setVisible(true)
      entry.label.setVisible(true)
      const pos = entry.marker.getPosition()
      if (pos) bounds.extend(pos)
    }
    if (!bounds.isEmpty()) {
      fitBoundsPreserveRotation(map, bounds, { top: 40, right: 40, bottom: 40, left: 40 })
    }
    refreshDetailVisibility()
  }, [map, mapBuildings, refreshDetailVisibility])

  const showAllMarkers = useCallback(() => {
    if (!map) return
    for (const entry of buildingMarkersRef.current) {
      entry.marker.setVisible(true)
      entry.label.setVisible(true)
    }
    const bounds = new google.maps.LatLngBounds()
    for (const entry of buildingMarkersRef.current) {
      const pos = entry.marker.getPosition()
      if (pos) bounds.extend(pos)
    }
    if (!bounds.isEmpty()) {
      fitBoundsPreserveRotation(map, bounds, { top: 40, right: 40, bottom: 40, left: 40 })
    }
    refreshDetailVisibility()
  }, [map, refreshDetailVisibility])

  const removeImageryOverlay = useCallback(() => {
    if (!map || !imageryOverlayRef.current) return
    const idx = map.overlayMapTypes.getArray().indexOf(imageryOverlayRef.current)
    if (idx >= 0) map.overlayMapTypes.removeAt(idx)
    imageryOverlayRef.current = null
  }, [map])

  const applyTileOverlay = useCallback(
    (getTileUrl: (coord: google.maps.Point, zoom: number) => string, _name: string) => {
      if (!map) return
      removeImageryOverlay()
      const imgType = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) => getTileUrl(coord, zoom),
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 20,
        name: _name,
        opacity: 1,
      })
      map.setMapTypeId('roadmap')
      map.overlayMapTypes.insertAt(0, imgType)
      imageryOverlayRef.current = imgType
    },
    [map, removeImageryOverlay],
  )

  const cycleImagery = useCallback(() => {
    if (!map) return null
    imageryModeRef.current = (imageryModeRef.current + 1) % 3
    const mode = imageryModeRef.current
    if (mode === 0) {
      removeImageryOverlay()
      map.setMapTypeId('hybrid')
    } else if (mode === 1) {
      applyTileOverlay(
        (coord, zoom) => ESRI_TILE_URL.replace('{z}', String(zoom)).replace('{y}', String(coord.y)).replace('{x}', String(coord.x)),
        'Esri',
      )
    } else {
      applyTileOverlay(
        (coord, zoom) => USGS_TILE_URL.replace('{z}', String(zoom)).replace('{y}', String(coord.y)).replace('{x}', String(coord.x)),
        'USGS',
      )
    }
    return IMAGERY_MODES[mode] ?? IMAGERY_MODES[0]!
  }, [map, removeImageryOverlay, applyTileOverlay])

  useEffect(() => {
    if (!map) return

    infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 340, disableAutoPan: true })
    infoWindowRef.current.addListener('closeclick', () => {
      activeInfoMarkerRef.current = null
    })
    infoWindowRef.current.addListener('content_changed', attachInfoWindowActions)

    buildingMarkersRef.current = []
    detailMarkersRef.current = []

    for (const b of buildings) {
      const color = getColor(b.park)
      const marker = new google.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map,
        title: b.address,
        icon: getMarkerIcon(color, false),
        zIndex: 10,
        draggable: dragMode,
      })

      marker.addListener('click', () => {
        callbacksRef.current.onSelectBuilding(b)
        openBuildingInfo(b, marker)
      })

      const labelText = b.address.length > 24 ? `${b.address.slice(0, 22)}…` : b.address
      const label = new google.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map,
        icon: {
          url: TRANSPARENT_ICON,
          scaledSize: new google.maps.Size(1, 1),
          anchor: new google.maps.Point(0.5, 0.5),
          labelOrigin: new google.maps.Point(0.5, 22),
        },
        label: {
          text: labelText,
          color: '#ffffff',
          fontSize: '10px',
          fontWeight: '600',
          fontFamily: 'Inter,sans-serif',
          className: 'bldg-label',
        },
        zIndex: 5,
        clickable: false,
        optimized: false,
      })

      marker.addListener('dragstart', () => {
        const startPos = marker.getPosition()
        if (!startPos) return
        const startLat = startPos.lat()
        const startLng = startPos.lng()
        setLastDragUndo(() => {
          marker.setPosition({ lat: startLat, lng: startLng })
          label.setPosition({ lat: startLat, lng: startLng })
          callbacksRef.current.onBuildingMoved?.(b, startLat, startLng)
        })
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        label.setPosition({ lat, lng })
        callbacksRef.current.onBuildingMoved?.(b, lat, lng)
      })

      buildingMarkersRef.current.push({ building: b, marker, label })
    }

    const makeDetailMarker = (
      lat: number,
      lng: number,
      layerKey: LayerKey,
      data: DetailMarkerEntry['data'],
      building: Building | null,
    ) => {
      if (!lat || !lng) return
      const cfg = LAYER_COLORS[layerKey]
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: data.name ?? '',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: cfg.fill,
          fillOpacity: 0.9,
          strokeColor: cfg.stroke,
          strokeWeight: 1,
          scale: cfg.scale,
        },
        zIndex: 20,
        visible: false,
        draggable: dragMode,
      })

      let label: google.maps.Marker | undefined
      if (data.name) {
        const labelText =
          layerKey === 'hydrant' ? 'Hydrant' : layerKey === 'gas' ? 'Gas Meter' : data.name
        label = new google.maps.Marker({
          position: { lat, lng },
          map,
          icon: {
            url: TRANSPARENT_ICON,
            scaledSize: new google.maps.Size(1, 1),
            anchor: new google.maps.Point(0.5, 0.5),
            labelOrigin: new google.maps.Point(0.5, -12),
          },
          label: {
            text: labelText,
            color: cfg.fill,
            fontSize: '9px',
            fontWeight: '700',
            fontFamily: 'Inter,sans-serif',
            className: 'rtu-label',
          },
          zIndex: 19,
          visible: false,
          clickable: false,
          optimized: false,
        })
      }

      marker.addListener('click', () => {
        openDetailInfo({ type: layerKey, building, data, marker, label })
      })

      marker.addListener('dragstart', () => {
        const startPos = marker.getPosition()
        if (!startPos) return
        const startLat = startPos.lat()
        const startLng = startPos.lng()
        setLastDragUndo(() => {
          marker.setPosition({ lat: startLat, lng: startLng })
          label?.setPosition({ lat: startLat, lng: startLng })
          callbacksRef.current.onDetailMoved?.(layerKey, data, startLat, startLng, building)
        })
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        label?.setPosition({ lat, lng })
        callbacksRef.current.onDetailMoved?.(layerKey, data, lat, lng, building)
      })

      detailMarkersRef.current.push({ type: layerKey, building, data, marker, label })
    }

    for (const b of buildings) {
      for (const r of b.rtus ?? []) {
        makeDetailMarker(r.lat, r.lng, 'rtu', r, b)
      }
    }

    for (const u of utilities) {
      const layerKey = UTILITY_LAYER_MAP[u.utility_type] ?? 'sprinkler'
      makeDetailMarker(u.lat, u.lng, layerKey, u, null)
    }

    map.addListener('zoom_changed', refreshDetailVisibility)
    map.addListener('idle', refreshDetailVisibility)

    return () => {
      for (const entry of buildingMarkersRef.current) {
        entry.marker.setMap(null)
        entry.label.setMap(null)
      }
      for (const entry of detailMarkersRef.current) {
        entry.marker.setMap(null)
        entry.label?.setMap(null)
      }
      buildingMarkersRef.current = []
      detailMarkersRef.current = []
      infoWindowRef.current?.close()
      infoWindowRef.current = null
      stopSoloMove()
    }
  }, [map, buildings, utilities, openBuildingInfo, openDetailInfo, attachInfoWindowActions, refreshDetailVisibility, stopSoloMove])

  useEffect(() => {
    refreshDetailVisibility()
  }, [layers, refreshDetailVisibility])

  useEffect(() => {
    const closePopups = () => {
      infoWindowRef.current?.close()
      activeInfoMarkerRef.current = null
      stopSoloMove()
    }
    window.addEventListener(MAP_CLOSE_POPUPS_EVENT, closePopups)
    return () => window.removeEventListener(MAP_CLOSE_POPUPS_EVENT, closePopups)
  }, [stopSoloMove])

  useEffect(() => {
    if (!map) return
    const listener = map.addListener('click', closeAllMapPopups)
    return () => google.maps.event.removeListener(listener)
  }, [map])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ layerKey: LayerKey; name: string; buildingAddress?: string }>).detail
      const entry = detailMarkersRef.current.find(
        (dm) =>
          dm.type === detail.layerKey &&
          dm.data.name === detail.name &&
          (detail.buildingAddress
            ? dm.building?.address === detail.buildingAddress
            : !dm.building),
      )
      if (!entry || !map) return
      panToPreserveRotation(map, { lat: entry.data.lat, lng: entry.data.lng }, 21)
      openDetailInfo(entry)
    }
    window.addEventListener('map:openDetail', handler)
    return () => window.removeEventListener('map:openDetail', handler)
  }, [map, openDetailInfo])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ address: string }>).detail
      if (!map) return
      const entry = buildingMarkersRef.current.find((m) => m.building.address === detail.address)
      if (!entry) return
      panToPreserveRotation(map, { lat: entry.building.lat, lng: entry.building.lng }, 21)
      callbacksRef.current.onSelectBuilding(entry.building)
      openBuildingInfo(entry.building, entry.marker)
    }
    window.addEventListener('map:openBuilding', handler)
    return () => window.removeEventListener('map:openBuilding', handler)
  }, [map, openBuildingInfo])

  const visibleAddressesRef = useRef('')

  useEffect(() => {
    const q = search.trim()
    if (q && collectSearchHits(buildings, polygons, q).length > 0) {
      return
    }

    const addressKey = mapBuildings
      .map((b) => b.address)
      .sort()
      .join('\n')
    if (addressKey === visibleAddressesRef.current) {
      return
    }
    visibleAddressesRef.current = addressKey
    fitAllMarkers()
  }, [mapBuildings, fitAllMarkers, buildings, polygons, search])

  useEffect(() => {
    if (currentBuilding) {
      highlightBuilding(currentBuilding)
      if (!map) return
      const entry = buildingMarkersRef.current.find(
        (m) => m.building.address === currentBuilding.address,
      )
      if (entry) {
        panToPreserveRotation(map, { lat: currentBuilding.lat, lng: currentBuilding.lng }, 21)
        openBuildingInfo(currentBuilding, entry.marker)
        setTimeout(() => {
          document.querySelector('.building-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 60)
      }
    }
  }, [currentBuilding, map, highlightBuilding, openBuildingInfo])

  useEffect(() => {
    refreshDetailVisibility()
  }, [layers, refreshDetailVisibility])

  useEffect(() => {
    for (const entry of buildingMarkersRef.current) {
      const isSolo = soloMoveRef.current?.marker === entry.marker
      entry.marker.setDraggable(dragMode || isSolo)
      if (!isSolo) entry.marker.setCursor(dragMode ? 'grab' : null)
    }
    for (const entry of detailMarkersRef.current) {
      const isSolo = soloMoveRef.current?.marker === entry.marker
      entry.marker.setDraggable(dragMode || isSolo)
      if (!isSolo) entry.marker.setCursor(dragMode ? 'grab' : null)
    }
  }, [dragMode])

  return {
    fitAllMarkers,
    showAllMarkers,
    cycleImagery,
    refreshDetailVisibility,
    buildingMarkersRef,
    detailMarkersRef,
  }
}
