import { useCallback, useEffect, useRef, useState } from 'react'
import { AddMarkerPanel } from '@/features/map/AddMarkerPanel'
import { ImportExportButtons } from '@/features/import-export/ImportExportButtons'
import { PolygonDrawPanel } from '@/features/polygons/PolygonDrawPanel'
import { useMapMarkers } from '@/features/map/useMapMarkers'
import { usePolygons } from '@/features/polygons/usePolygons'
import { readGoogleMapsEnv, loadGoogleMaps } from '@/lib/googleMaps'
import { IMAGERY_MODES } from '@/lib/constants'
import type { Building, PortfolioData } from '@/types/domain'
import type { ImageryMode } from '@/types/domain'
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
  onOpenPolygonDraw?: () => void
}

export function MapPanel({
  portfolio,
  mapBuildings,
  onPortfolioImport,
  onPortfolioPatch,
  polygonDrawOpen = false,
  onPolygonDrawClose,
}: MapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [imageryMode, setImageryMode] = useState<ImageryMode>(IMAGERY_MODES[0]!)
  const [addMarkerOpen, setAddMarkerOpen] = useState(false)

  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const selectBuilding = useSelectionStore((s) => s.selectBuilding)
  const openSettings = useUiStore((s) => s.openSettings)

  const { apiKey, mapId, isConfigured: mapsConfigured } = readGoogleMapsEnv()

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

  const { hoverTipRef, showAllMarkers, cycleImagery } = useMapMarkers({
    map,
    buildings: portfolio.buildings,
    mapBuildings,
    utilities: portfolio.utilities,
    polygons: portfolio.polygons,
    onSelectBuilding: handleSelectBuilding,
    onBuildingMoved: handleBuildingMoved,
  })

  usePolygons({
    map,
    polygons: portfolio.polygons,
    onPolygonUpdated: (polygon) => {
      onPortfolioPatch({
        ...portfolio,
        polygons: portfolio.polygons.map((p) => (p.id === polygon.id ? polygon : p)),
      })
    },
    onPolygonDeleted: (id) => {
      onPortfolioPatch({
        ...portfolio,
        polygons: portfolio.polygons.filter((p) => p.id !== id),
      })
    },
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lng: number; zoom?: number }>).detail
      if (!map) return
      map.panTo({ lat: detail.lat, lng: detail.lng })
      if (detail.zoom) map.setZoom(detail.zoom)
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
        })
        setMap(instance)
      })
      .catch((err: Error) => {
        setMapError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [mapsConfigured, mapId])

  const handleCycleImagery = () => {
    const mode = cycleImagery()
    if (mode) setImageryMode(mode)
  }

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
    : `${mapBuildings.length} buildings on map`

  return (
    <div className="map-panel">
      <div className="map-topbar">
        <div className={styles.topbarLeft}>
          <div className="map-address" id="map-address">
            {currentBuilding?.address ?? 'Building Map Explorer'}
          </div>
          <div className="map-subtitle" id="map-subtitle">
            {subtitle}
          </div>
        </div>
        <div className="map-actions">
          {currentBuilding ? (
            <a
              id="gmaps-link"
              className="btn-action"
              href={`https://www.google.com/maps?q=${currentBuilding.lat},${currentBuilding.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Maps ↗
            </a>
          ) : null}
          <button type="button" className="btn-action primary" onClick={showAllMarkers}>
            Show all
          </button>
          <button
            type="button"
            id="imagery-btn"
            className="btn-action"
            onClick={handleCycleImagery}
            style={{
              borderColor: imageryMode.borderColor,
              color: imageryMode.color,
            }}
            title="Switch satellite imagery: Google / Esri / USGS"
          >
            {imageryMode.label}
          </button>
          <button type="button" className="btn-action" onClick={() => setAddMarkerOpen(true)} title="Add marker">
            + Marker
          </button>
          <ImportExportButtons portfolio={portfolio} onImport={onPortfolioImport} compact />
          <button type="button" className="btn-action" onClick={openSettings} title="Settings">
            ⚙ Settings
          </button>
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
                {mapError ??
                  'Set VITE_GOOGLE_MAPS_API_KEY in .env.local to enable the interactive map.'}
              </p>
              {!apiKey ? (
                <p style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
                  Sidebar filters and cost estimator work without a map key.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div ref={mapRef} id="map" className={styles.mapCanvas} />
        )}
        <div id="map-hover-tip" ref={hoverTipRef} />
      </div>
      <AddMarkerPanel
        open={addMarkerOpen}
        onClose={() => setAddMarkerOpen(false)}
        portfolio={portfolio}
        onAdded={(utility) =>
          onPortfolioPatch({ ...portfolio, utilities: [...portfolio.utilities, utility] })
        }
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
