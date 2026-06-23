import { useCallback, useEffect, useRef, useState } from 'react'
import { AddMarkerPanel } from '@/features/map/AddMarkerPanel'
import { PolygonDrawPanel } from '@/features/polygons/PolygonDrawPanel'
import { useMapMarkers } from '@/features/map/useMapMarkers'
import { usePolygons } from '@/features/polygons/usePolygons'
import { useMapRotation } from '@/hooks/useMapRotation'
import { readGoogleMapsEnv, loadGoogleMaps } from '@/lib/googleMaps'
import { IMAGERY_MODES } from '@/lib/constants'
import { panToPreserveRotation } from '@/lib/mapRotation'
import type { Building, LayerKey, Polygon, PortfolioData, Rtu, Tenant, Utility } from '@/types/domain'
import type { ImageryMode } from '@/types/domain'
import { useFilterStore } from '@/stores/filterStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './MapPanel.module.css'

export interface MapPanelProps {
  portfolio: PortfolioData
  mapBuildings: Building[]
  onPortfolioImport: (data: PortfolioData) => void
  onPortfolioPatch: (data: PortfolioData) => void
  polygonDrawOpen?: boolean
  onPolygonDrawClose?: () => void
  addMarkerOpen?: boolean
  onAddMarkerClose?: () => void
}

export function MapPanel({
  portfolio,
  mapBuildings,
  onPortfolioPatch,
  polygonDrawOpen = false,
  onPolygonDrawClose,
  addMarkerOpen = false,
  onAddMarkerClose,
}: MapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [imageryMode, setImageryMode] = useState<ImageryMode>(IMAGERY_MODES[0]!)

  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const selectBuilding = useSelectionStore((s) => s.selectBuilding)
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  const dragMode = useSelectionStore((s) => s.dragMode)
  const resetFilters = useFilterStore((s) => s.resetFilters)
  const openSettings = useUiStore((s) => s.openSettings)

  const { mapId, isConfigured: mapsConfigured } = readGoogleMapsEnv()

  useMapRotation(map, mapRef)

  useEffect(() => {
    usePortfolioStore.setState({ portfolio })
  }, [portfolio])

  const handleSelectBuilding = useCallback(
    (building: Building) => {
      selectBuilding(building)
    },
    [selectBuilding],
  )

  const handleBuildingMoved = useCallback(
    (building: Building, lat: number, lng: number) => {
      onPortfolioPatch({
        ...portfolio,
        buildings: portfolio.buildings.map((b) =>
          b.address === building.address ? { ...b, lat, lng } : b,
        ),
      })
    },
    [onPortfolioPatch, portfolio],
  )

  const handleDetailMoved = useCallback(
    (
      layerKey: LayerKey,
      data: Rtu | Tenant | Utility,
      lat: number,
      lng: number,
      building: Building | null,
    ) => {
      if (layerKey === 'rtu' && building) {
        onPortfolioPatch({
          ...portfolio,
          buildings: portfolio.buildings.map((b) =>
            b.address === building.address
              ? {
                  ...b,
                  rtus: b.rtus?.map((r) =>
                    r.name === data.name ? { ...r, lat, lng } : r,
                  ),
                }
              : b,
          ),
        })
      } else if ('utility_type' in data) {
        onPortfolioPatch({
          ...portfolio,
          utilities: portfolio.utilities.map((u) =>
            u.name === data.name && u.utility_type === data.utility_type
              ? { ...u, lat, lng }
              : u,
          ),
        })
      }
    },
    [onPortfolioPatch, portfolio],
  )

  const handleDeleteDetail = useCallback(
    (layerKey: LayerKey, data: Rtu | Tenant | Utility, building: Building | null) => {
      if (layerKey === 'rtu' && building) {
        onPortfolioPatch({
          ...portfolio,
          buildings: portfolio.buildings.map((b) =>
            b.address === building.address
              ? { ...b, rtus: b.rtus?.filter((r) => r.name !== data.name) }
              : b,
          ),
        })
      } else if ('utility_type' in data) {
        onPortfolioPatch({
          ...portfolio,
          utilities: portfolio.utilities.filter(
            (u) => !(u.name === data.name && u.utility_type === data.utility_type),
          ),
        })
      }
    },
    [onPortfolioPatch, portfolio],
  )

  const handlePolygonUpdated = useCallback(
    (polygon: Polygon) => {
      onPortfolioPatch({
        ...portfolio,
        polygons: portfolio.polygons.map((p) =>
          p.name === polygon.name && p.description === polygon.description ? polygon : p,
        ),
      })
    },
    [onPortfolioPatch, portfolio],
  )

  const handlePolygonDeleted = useCallback(
    (polygon: Polygon) => {
      onPortfolioPatch({
        ...portfolio,
        polygons: portfolio.polygons.filter(
          (p) => !(p.name === polygon.name && p.description === polygon.description),
        ),
      })
    },
    [onPortfolioPatch, portfolio],
  )

  const { showAllMarkers, cycleImagery } = useMapMarkers({
    map,
    buildings: portfolio.buildings,
    mapBuildings,
    utilities: portfolio.utilities,
    polygons: portfolio.polygons,
    onSelectBuilding: handleSelectBuilding,
    onBuildingMoved: handleBuildingMoved,
    onDetailMoved: handleDetailMoved,
    onDeleteDetail: handleDeleteDetail,
  })

  usePolygons({
    map,
    polygons: portfolio.polygons,
    onPolygonUpdated: handlePolygonUpdated,
    onPolygonDeleted: handlePolygonDeleted,
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lng: number; zoom?: number }>).detail
      if (!map) return
      panToPreserveRotation(map, { lat: detail.lat, lng: detail.lng }, detail.zoom)
    }
    window.addEventListener('map:panTo', handler)
    return () => window.removeEventListener('map:panTo', handler)
  }, [map])

  useEffect(() => {
    if (!mapsConfigured || !mapRef.current) return
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapRef.current) return
        const instance = new google.maps.Map(mapRef.current, {
          mapId,
          center: { lat: 43.65, lng: -79.62 },
          zoom: 10,
          mapTypeId: 'satellite',
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          rotateControl: true,
          headingInteractionEnabled: true,
          tiltInteractionEnabled: true,
          isFractionalZoomEnabled: true,
          renderingType: google.maps.RenderingType.VECTOR,
        })
        setMap(instance)
      })
      .catch((err: Error) => setMapError(err.message))
    return () => {
      cancelled = true
    }
  }, [mapsConfigured, mapId])

  useEffect(() => {
    const panel = mapRef.current?.closest('.map-panel')
    if (!panel) return
    const existing = panel.querySelector('#drag-notice')
    if (!dragMode) {
      existing?.remove()
      return
    }
    if (existing) return
    const notice = document.createElement('div')
    notice.id = 'drag-notice'
    notice.innerHTML =
      '✦ Drag mode ON &nbsp;—&nbsp; drag any marker to reposition it &nbsp;·&nbsp; <span style="opacity:.8">click Edit Positions again to exit</span>'
    panel.appendChild(notice)
    return () => notice.remove()
  }, [dragMode])

  const handleCycleImagery = () => {
    const mode = cycleImagery()
    if (mode) setImageryMode(mode)
  }

  const handleShowAll = () => {
    clearSelection()
    resetFilters()
    showAllMarkers()
  }

  const mapTitle = currentBuilding?.address ?? 'Industrial Portfolio — Ontario'
  const subtitle = currentBuilding
    ? [
        currentBuilding.cluster || currentBuilding.park,
        currentBuilding.sqft ? `${currentBuilding.sqft} sf` : null,
        `${currentBuilding.rtus?.length ?? 0} RTUs`,
        `${currentBuilding.tenants?.length ?? 0} tenants`,
        currentBuilding.manager,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${portfolio.buildings.length} buildings · Click a marker or address to focus`

  return (
    <div className="map-panel">
      <div className="map-topbar">
        <div className={styles.topbarLeft}>
          <div className="map-address" id="map-address">
            {mapTitle}
          </div>
          <div className="map-subtitle" id="map-subtitle">
            {subtitle}
          </div>
        </div>
        <div className="map-actions">
          <button type="button" className="btn-action" style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }} onClick={handleShowAll}>
            All Buildings
          </button>
          <button
            type="button"
            id="imagery-btn"
            className="btn-action"
            onClick={handleCycleImagery}
            style={{ borderColor: imageryMode.borderColor, color: imageryMode.color }}
            title="Switch satellite imagery: Google / Esri / USGS"
          >
            {imageryMode.label}
          </button>
          <button type="button" className="btn-action" onClick={openSettings} title="Settings — themes & manager names" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            Settings
          </button>
          {currentBuilding ? (
            <a
              id="gmaps-link"
              className="btn-action primary"
              href={`https://www.google.com/maps?q=${currentBuilding.lat},${currentBuilding.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Maps ↗
            </a>
          ) : null}
        </div>
      </div>

      <div className={styles.mapWrap}>
        {!mapsConfigured || mapError ? (
          <div className={styles.mapPlaceholder} id="map">
            <div>
              <p>
                <strong>Map placeholder</strong>
              </p>
              <p style={{ marginTop: 8, fontSize: 12 }}>
                {mapError ?? 'Set VITE_GOOGLE_MAPS_API_KEY in .env.local to enable the interactive map.'}
              </p>
            </div>
          </div>
        ) : (
          <div ref={mapRef} id="map" className={styles.mapCanvas} />
        )}
      </div>

      <AddMarkerPanel
        open={addMarkerOpen}
        onClose={() => onAddMarkerClose?.()}
        portfolio={portfolio}
        map={map}
        onAdded={onPortfolioPatch}
        defaultLat={currentBuilding?.lat}
        defaultLng={currentBuilding?.lng}
      />
      <PolygonDrawPanel
        open={polygonDrawOpen}
        onClose={() => onPolygonDrawClose?.()}
        map={map}
        onSaved={(polygon) =>
          onPortfolioPatch({ ...portfolio, polygons: [...portfolio.polygons, polygon] })
        }
      />
    </div>
  )
}
