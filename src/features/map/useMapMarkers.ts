import { useCallback, useEffect, useRef } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'
import { getColor } from '@/lib/colors'
import {
  canPersistToSupabase,
  updateBuildingPosition,
  updateRtuPosition,
  updateTenantPosition,
  updateUtilityPosition,
} from '@/lib/portfolioApi'
import {
  ESRI_TILE_URL,
  IMAGERY_MODES,
  LAYER_COLORS,
  USGS_TILE_URL,
  UTILITY_LAYER_MAP,
} from '@/lib/constants'
import { buildBuildingInfoHtml, buildDetailInfoHtml, buildHoverTipHtml } from '@/lib/mapInfoWindow'
import { useLayerStore } from '@/stores/layerStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useSettingsStore } from '@/stores/settingsStore'
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
  onDetailMoved?: (layerKey: LayerKey, data: Rtu | Tenant | Utility, lat: number, lng: number) => void
}

export function useMapMarkers({
  map,
  buildings,
  mapBuildings,
  utilities,
  onSelectBuilding,
  onBuildingMoved,
  onDetailMoved,
}: UseMapMarkersOptions) {
  const { isAuthenticated } = useAuthContext()
  const layers = useLayerStore((s) => s.layers)
  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const dragMode = useSelectionStore((s) => s.dragMode)
  const getManagerName = useSettingsStore((s) => s.getManagerName)

  const buildingMarkersRef = useRef<BuildingMarkerEntry[]>([])
  const detailMarkersRef = useRef<DetailMarkerEntry[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const activeInfoMarkerRef = useRef<google.maps.Marker | null>(null)
  const imageryModeRef = useRef(0)
  const imageryOverlayRef = useRef<google.maps.ImageMapType | null>(null)
  const hoverTipRef = useRef<HTMLDivElement | null>(null)

  const resetBuildingIcons = useCallback(() => {
    for (const entry of buildingMarkersRef.current) {
      const color = getColor(entry.building.park)
      entry.marker.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 0.95,
        strokeColor: '#fff',
        strokeWeight: 1.5,
        scale: 9,
      })
      entry.marker.setZIndex(10)
    }
  }, [])

  const highlightBuilding = useCallback(
    (building: Building) => {
      resetBuildingIcons()
      const entry = buildingMarkersRef.current.find((m) => m.building.address === building.address)
      if (!entry) return
      const color = getColor(building.park)
      entry.marker.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
        scale: 14,
      })
      entry.marker.setZIndex(999)
    },
    [resetBuildingIcons],
  )

  const openBuildingInfo = useCallback(
    (building: Building, marker: google.maps.Marker) => {
      if (!map || !infoWindowRef.current) return
      if (activeInfoMarkerRef.current === marker) {
        infoWindowRef.current.close()
        activeInfoMarkerRef.current = null
        return
      }
      infoWindowRef.current.setContent(buildBuildingInfoHtml(building, getManagerName))
      infoWindowRef.current.open({ map, anchor: marker })
      activeInfoMarkerRef.current = marker
    },
    [map, getManagerName],
  )

  const refreshDetailVisibility = useCallback(() => {
    if (!map) return
    const zoom = map.getZoom() ?? 0
    const bounds = map.getBounds()
    for (const dm of detailMarkersRef.current) {
      const pos = dm.marker.getPosition()
      const show =
        layers[dm.type] &&
        zoom >= 16 &&
        Boolean(bounds && pos && bounds.contains(pos))
      dm.marker.setVisible(show)
      dm.label?.setVisible(show)
    }
  }, [map, layers])

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
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
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
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
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

    infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 340 })
    infoWindowRef.current.addListener('closeclick', () => {
      activeInfoMarkerRef.current = null
    })

    buildingMarkersRef.current = []
    detailMarkersRef.current = []

    for (const b of buildings) {
      const color = getColor(b.park)
      const marker = new google.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map,
        title: b.address,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: '#fff',
          strokeWeight: 1.5,
          scale: 9,
        },
        zIndex: 10,
        draggable: dragMode,
      })

      marker.addListener('click', () => {
        onSelectBuilding(b)
        openBuildingInfo(b, marker)
      })

      marker.addListener('mouseover', (e: google.maps.MapMouseEvent) => {
        const tip = hoverTipRef.current
        if (!tip) return
        tip.innerHTML = buildHoverTipHtml(b, getManagerName)
        tip.style.display = 'block'
        const domEvent = (e as google.maps.MapMouseEvent & { domEvent?: MouseEvent }).domEvent
        const mapDiv = map.getDiv()
        if (mapDiv && domEvent) {
          const rect = mapDiv.getBoundingClientRect()
          let x = domEvent.clientX - rect.left + 14
          let y = domEvent.clientY - rect.top - 14
          if (x + 240 > rect.width) x = domEvent.clientX - rect.left - 244
          if (y < 0) y = 4
          tip.style.left = `${x}px`
          tip.style.top = `${y}px`
        }
      })
      marker.addListener('mouseout', () => {
        if (hoverTipRef.current) hoverTipRef.current.style.display = 'none'
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        label.setPosition({ lat, lng })
        onBuildingMoved?.(b, lat, lng)
        if (canPersistToSupabase(isAuthenticated) && b.id) {
          void updateBuildingPosition(b.id, lat, lng).catch(console.error)
        }
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
        },
        zIndex: 5,
        clickable: false,
        optimized: false,
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
          },
          zIndex: 19,
          visible: false,
          clickable: false,
          optimized: false,
        })
      }

      marker.addListener('click', () => {
        if (!infoWindowRef.current) return
        if (activeInfoMarkerRef.current === marker) {
          infoWindowRef.current.close()
          activeInfoMarkerRef.current = null
          return
        }
        infoWindowRef.current.setContent(buildDetailInfoHtml(layerKey, data))
        infoWindowRef.current.open({ map, anchor: marker })
        activeInfoMarkerRef.current = marker
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        label?.setPosition({ lat, lng })
        onDetailMoved?.(layerKey, data, lat, lng)
        if (!canPersistToSupabase(isAuthenticated)) return
        if (layerKey === 'rtu' && 'building_id' in data && data.id) {
          void updateRtuPosition(data.id, lat, lng).catch(console.error)
        } else if (layerKey === 'tenants' && 'building_id' in data && data.id) {
          void updateTenantPosition(data.id, lat, lng).catch(console.error)
        } else if (data.id && !('building_id' in data)) {
          void updateUtilityPosition(data.id, lat, lng).catch(console.error)
        } else if (data.id && 'utility_type' in data) {
          void updateUtilityPosition(data.id, lat, lng).catch(console.error)
        }
      })

      detailMarkersRef.current.push({ type: layerKey, building, data, marker, label })
    }

    for (const b of buildings) {
      for (const r of b.rtus ?? []) {
        makeDetailMarker(r.lat, r.lng, 'rtu', r, b)
      }
      for (const t of b.tenants ?? []) {
        makeDetailMarker(t.lat, t.lng, 'tenants', t, b)
      }
    }

    for (const u of utilities) {
      const layerKey = UTILITY_LAYER_MAP[u.utility_type] ?? 'sprinkler'
      makeDetailMarker(u.lat, u.lng, layerKey, u, null)
    }

    map.addListener('zoom_changed', refreshDetailVisibility)
    map.addListener('idle', refreshDetailVisibility)
    fitAllMarkers()

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
    }
  }, [
    map,
    buildings,
    utilities,
    dragMode,
    onSelectBuilding,
    onBuildingMoved,
    onDetailMoved,
    openBuildingInfo,
    getManagerName,
    refreshDetailVisibility,
    fitAllMarkers,
    isAuthenticated,
  ])

  useEffect(() => {
    fitAllMarkers()
  }, [mapBuildings, fitAllMarkers])

  useEffect(() => {
    if (currentBuilding) {
      highlightBuilding(currentBuilding)
      if (!map) return
      const entry = buildingMarkersRef.current.find(
        (m) => m.building.address === currentBuilding.address,
      )
      if (entry) {
        const savedHdg = map.getHeading() ?? 0
        map.panTo({ lat: currentBuilding.lat, lng: currentBuilding.lng })
        map.setZoom(21)
        if (savedHdg) map.setHeading(savedHdg)
        openBuildingInfo(currentBuilding, entry.marker)
      }
    }
  }, [currentBuilding, map, highlightBuilding, openBuildingInfo])

  useEffect(() => {
    refreshDetailVisibility()
  }, [layers, refreshDetailVisibility])

  useEffect(() => {
    for (const entry of buildingMarkersRef.current) {
      entry.marker.setDraggable(dragMode)
    }
    for (const entry of detailMarkersRef.current) {
      entry.marker.setDraggable(dragMode)
    }
  }, [dragMode])

  return {
    hoverTipRef,
    fitAllMarkers,
    showAllMarkers,
    cycleImagery,
    refreshDetailVisibility,
    buildingMarkersRef,
    detailMarkersRef,
  }
}
