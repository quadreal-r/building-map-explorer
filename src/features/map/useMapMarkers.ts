import { useCallback, useEffect, useRef } from 'react'
import {
  addAppMarkerListener,
  buildDetailMarkerContent,
  createAppMarker,
  getAppMarkerPosition,
  setAppMarkerDraggable,
  setAppMarkerClickable,
  setAppMarkerCursor,
  setAppMarkerIcon,
  setAppMarkerMap,
  setAppMarkerPosition,
  setAppMarkerVisible,
  setAppMarkerZIndex,
  setDetailMarkerContent,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import { getColor } from '@/lib/colors'
import { isLegacySuiteMarkerName } from '@/lib/legacySuiteMarkers'
import {
  ESRI_TILE_URL,
  IMAGERY_MODES,
  LAYER_COLORS,
  MAP_DETAIL_ZOOM,
  USGS_TILE_URL,
  UTILITY_LAYER_MAP,
} from '@/lib/constants'
import {
  applySnapshotToPortfolio,
  buildGroupDragSnapshot,
  buildingDragKey,
  detailDragKey,
  utilityDragKey,
} from '@/lib/dragSelection'
import {
  applyGroupDragDelta,
  beginGroupDrag,
  endGroupDrag,
  isGroupDragActive,
  registerGroupDragVisuals,
} from '@/lib/mapGroupDragSession'
import { buildPolygonBuildingIndex, polygonsForBuilding } from '@/lib/polygonBuildings'
import { consumeMapClickClearSuppression, registerMarqueeTarget, suppressMapClickClearOnce, unregisterMarqueeTarget } from '@/lib/mapMarqueeSelect'
import { tryConsumeMapAddMarkerPick } from '@/lib/mapAddMarkerPick'
import { afterMapViewChange, fitBoundsPreserveRotation, panToPreserveRotation } from '@/lib/mapRotation'
import {
  clearAllRtuDropTargets,
  registerRtuDropTarget,
  rtuDropTargetKey,
  unregisterRtuDropTarget,
} from '@/features/map/rtuDropTargetHighlight'
import { closeAllMapPopups, ensureInfoWindowVisible, MAP_CLOSE_POPUPS_EVENT } from '@/lib/mapPopups'
import { collectSearchHits } from '@/lib/searchHits'
import { getDetailMarkerIcon, getMarkerIcon } from '@/lib/markerStyles'
import { buildBuildingInfoHtml, buildDetailInfoHtml, buildRtuPicturesHtml, copyPopupText } from '@/lib/mapInfoWindow'
import { hideRtuManifestPicture } from '@/lib/hiddenRtuPictures'
import {
  addRtuPicturesFromFiles,
  deleteRtuPicture,
  getRtuPictureCountMap,
  listRtuPictures,
  loadRtuPictureManifest,
  notifyRtuPicturesChanged,
  onRtuPicturesChanged,
  resolveManifestRtuKey,
  revokeRtuPictureUrls,
  rtuPictureKey,
  type RtuPicture,
} from '@/lib/rtuPictures'
import { showToastError, showToastSuccess } from '@/lib/toast'
import {
  countPendingPicturesNearRtu,
  findNearestPendingPictureToRtu,
} from '@/lib/rtuPictureGpsAssign'
import { RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { useLayerStore } from '@/stores/layerStore'
import { useFilterStore } from '@/stores/filterStore'
import { usePendingRtuPictureStore } from '@/stores/pendingRtuPictureStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import type { Building, LayerKey, Polygon, Rtu, Utility } from '@/types/domain'

interface BuildingMarkerEntry {
  building: Building
  marker: AppMapMarker
  label: AppMapMarker
}

const MAP_BUILDING_FIT_PADDING = { top: 40, right: 40, bottom: 40, left: 40 } as const

function fitMapToBuildingMarkers(map: google.maps.Map, entries: BuildingMarkerEntry[]): void {
  const bounds = new google.maps.LatLngBounds()
  for (const entry of entries) {
    bounds.extend({ lat: entry.building.lat, lng: entry.building.lng })
  }
  if (!bounds.isEmpty()) {
    fitBoundsPreserveRotation(map, bounds, MAP_BUILDING_FIT_PADDING)
  }
}

interface DetailMarkerEntry {
  type: LayerKey
  building: Building | null
  data: Rtu | Utility
  marker: AppMapMarker
  pictureCount?: number
  dragKey: string
}

function detailLabelFor(entry: DetailMarkerEntry): google.maps.MarkerLabel | undefined {
  const { type: layerKey, data } = entry
  if (!data.name) return undefined
  const cfg = LAYER_COLORS[layerKey]
  return {
    text: layerKey === 'hydrant' ? 'Hydrant' : layerKey === 'gas' ? 'Gas Meter' : data.name,
    color: cfg.fill,
    fontSize: layerKey === 'rtu' ? '11px' : '9px',
    fontWeight: layerKey === 'rtu' ? '500' : '700',
    fontFamily: 'Inter,sans-serif',
    className: layerKey === 'rtu' ? 'rtu-marker-label' : 'rtu-label',
  }
}

function detailIconFor(entry: DetailMarkerEntry, isSelected: boolean): google.maps.Symbol {
  const cfg = LAYER_COLORS[entry.type]
  if (isSelected) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: cfg.fill,
      fillOpacity: 0.9,
      strokeColor: '#ffffff',
      strokeWeight: 3,
      scale: cfg.scale + 2,
    }
  }
  return getDetailMarkerIcon(cfg.fill, cfg.stroke, {
    shapeIndex: entry.data.marker_shape,
    scale: entry.data.marker_scale,
    defaultScale: cfg.scale,
  })
}

function syncDetailMarkerAppearance(entry: DetailMarkerEntry, isSelected = false): void {
  setDetailMarkerContent(entry.marker, {
    icon: detailIconFor(entry, isSelected),
    label: detailLabelFor(entry),
    labelOffsetY: entry.type === 'rtu' ? -7 : -4,
    pictureCount: entry.type === 'rtu' ? (entry.pictureCount ?? 0) : 0,
  })
  if (entry.type === 'rtu' && entry.building && entry.data.name) {
    registerRtuDropTarget(
      rtuDropTargetKey(entry.building.address, entry.data.name),
      entry.marker,
      20,
    )
  }
}

function syncDetailMarkerPositions(entry: DetailMarkerEntry, lat: number, lng: number): void {
  setAppMarkerPosition(entry.marker, lat, lng)
}

interface ActiveDetailInfo {
  entry: DetailMarkerEntry
  view: 'info' | 'pictures'
  pictureIndex: number
}

export interface UseMapMarkersOptions {
  map: google.maps.Map | null
  buildings: Building[]
  mapBuildings: Building[]
  utilities: Utility[]
  polygons: Polygon[]
  onSelectBuilding: (building: Building) => void
  onBuildingMoved?: (building: Building, lat: number, lng: number) => void
  onDetailMoved?: (layerKey: LayerKey, data: Rtu | Utility, lat: number, lng: number, building: Building | null) => void
  onDeleteDetail?: (layerKey: LayerKey, data: Rtu | Utility, building: Building | null) => void
  onGroupMoved?: (portfolio: { buildings: Building[]; utilities: Utility[]; polygons: Polygon[] }) => void
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
  onGroupMoved,
}: UseMapMarkersOptions) {
  const layers = useLayerStore((s) => s.layers)
  const search = useFilterStore((s) => s.search)
  const currentBuilding = useSelectionStore((s) => s.currentBuilding)
  const dragMode = useSelectionStore((s) => s.dragMode)
  const dragSelectedKeys = useSelectionStore((s) => s.dragSelectedKeys)
  const setLastDragUndo = useSelectionStore((s) => s.setLastDragUndo)

  const portfolioRef = useRef({ buildings, utilities, polygons })
  const polygonIndexRef = useRef(buildPolygonBuildingIndex(buildings, polygons))

  useEffect(() => {
    portfolioRef.current = { buildings, utilities, polygons }
    polygonIndexRef.current = buildPolygonBuildingIndex(buildings, polygons)
  }, [buildings, utilities, polygons])

  useEffect(() => {
    void loadRtuPictureManifest()
  }, [])

  const buildingMarkersRef = useRef<BuildingMarkerEntry[]>([])
  const detailMarkersRef = useRef<DetailMarkerEntry[]>([])
  const hasInitialBuildingFitRef = useRef(false)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const activeInfoMarkerRef = useRef<AppMapMarker | null>(null)
  const activeDetailInfoRef = useRef<ActiveDetailInfo | null>(null)
  const activeRtuPicturesRef = useRef<RtuPicture[]>([])
  const imageryModeRef = useRef(0)
  const imageryOverlayRef = useRef<google.maps.ImageMapType | null>(null)
  const soloMoveRef = useRef<{ marker: AppMapMarker; label?: AppMapMarker } | null>(null)
  const soloMoveListenerRef = useRef<google.maps.MapsEventListener | null>(null)

  const callbacksRef = useRef({
    onSelectBuilding,
    onBuildingMoved,
    onDetailMoved,
    onDeleteDetail,
  })

  const layersRef = useRef(layers)

  useEffect(() => {
    callbacksRef.current = { onSelectBuilding, onBuildingMoved, onDetailMoved, onDeleteDetail }
  }, [onSelectBuilding, onBuildingMoved, onDetailMoved, onDeleteDetail])

  useEffect(() => {
    layersRef.current = layers
  }, [layers])

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
          onGroupMoved?.(applySnapshotToPortfolio(portfolioRef.current, beforeSnapshot))
        })
      }
    },
    [onGroupMoved, resolveGroupKeys, setLastDragUndo],
  )

  useEffect(() => {
    registerGroupDragVisuals({
      setBuildingPosition: (address, lat, lng) => {
        const entry = buildingMarkersRef.current.find((m) => m.building.address === address)
        if (!entry) return
        setAppMarkerPosition(entry.marker, lat, lng)
        setAppMarkerPosition(entry.label, lat, lng)
        setAppMarkerVisible(entry.marker, true)
        setAppMarkerVisible(entry.label, true)
      },
      setDetailPosition: (key, lat, lng) => {
        const entry = detailMarkersRef.current.find((m) => m.dragKey === key)
        if (!entry) return
        syncDetailMarkerPositions(entry, lat, lng)
        setAppMarkerVisible(entry.marker, true)
      },
    })
    return () => {
      registerGroupDragVisuals({
        setBuildingPosition: undefined,
        setDetailPosition: undefined,
      })
    }
  }, [])

  const refreshDragSelectionStyles = useCallback(() => {
    const selected = new Set(useSelectionStore.getState().dragSelectedKeys)
    for (const entry of buildingMarkersRef.current) {
      const color = getColor(entry.building.park)
      const isSelected = selected.has(buildingDragKey(entry.building.address))
      setAppMarkerIcon(entry.marker, getMarkerIcon(color, isSelected))
      setAppMarkerZIndex(entry.marker, isSelected ? 999 : 10)
    }
    for (const entry of detailMarkersRef.current) {
      const isSelected = selected.has(entry.dragKey)
      syncDetailMarkerAppearance(entry, isSelected)
    }
  }, [])

  useEffect(() => {
    refreshDragSelectionStyles()
  }, [dragMode, dragSelectedKeys, refreshDragSelectionStyles])

  const resetBuildingIcons = useCallback(() => {
    for (const entry of buildingMarkersRef.current) {
      const color = getColor(entry.building.park)
      setAppMarkerIcon(entry.marker, getMarkerIcon(color, false))
      setAppMarkerZIndex(entry.marker, 10)
    }
  }, [])

  const highlightBuilding = useCallback(
    (building: Building) => {
      resetBuildingIcons()
      const entry = buildingMarkersRef.current.find((m) => m.building.address === building.address)
      if (!entry) return
      const color = getColor(building.park)
      setAppMarkerIcon(entry.marker, getMarkerIcon(color, true))
      setAppMarkerZIndex(entry.marker, 999)
    },
    [resetBuildingIcons],
  )

  const clearActiveRtuPictures = useCallback(() => {
    revokeRtuPictureUrls(activeRtuPicturesRef.current.filter((p) => p.source === 'indexeddb'))
    activeRtuPicturesRef.current = []
  }, [])

  const refreshRtuPicturesView = useCallback(async () => {
    const ctx = activeDetailInfoRef.current
    const iw = infoWindowRef.current
    if (!ctx || !iw || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return

    const buildingAddress = ctx.entry.building?.address ?? ''
    if (!buildingAddress) return

    clearActiveRtuPictures()
    const pictures = await listRtuPictures(buildingAddress, ctx.entry.data.name)
    activeRtuPicturesRef.current = pictures
    if (pictures.length) {
      ctx.pictureIndex = Math.min(Math.max(ctx.pictureIndex, 0), pictures.length - 1)
    } else {
      ctx.pictureIndex = 0
    }

    iw.setContent(
      buildRtuPicturesHtml(
        ctx.entry.data as Rtu,
        buildingAddress,
        pictures,
        ctx.pictureIndex,
      ),
    )
  }, [clearActiveRtuPictures])

  const openBuildingInfo = useCallback(
    (building: Building, marker: AppMapMarker) => {
      if (!map || !infoWindowRef.current) return
      if (activeInfoMarkerRef.current === marker) {
        closeAllMapPopups()
        return
      }
      closeAllMapPopups()
      activeDetailInfoRef.current = null
      clearActiveRtuPictures()
      const tenantPolygons = polygonsForBuilding(polygonIndexRef.current, building.address)
      const managerRenames = useSettingsStore.getState().managerRenames
      infoWindowRef.current.setContent(
        buildBuildingInfoHtml(building, tenantPolygons, managerRenames),
      )
      infoWindowRef.current.open({ map, anchor: marker })
      ensureInfoWindowVisible(map, infoWindowRef.current)
      activeInfoMarkerRef.current = marker
      afterMapViewChange(map)
    },
    [map, clearActiveRtuPictures],
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
      clearActiveRtuPictures()
      activeDetailInfoRef.current = { entry, view: 'info', pictureIndex: 0 }
      const rtu = entry.type === 'rtu' ? (entry.data as Rtu) : null
      const pendingItems = usePendingRtuPictureStore.getState().items
      const pendingPictureAssignCount =
        rtu != null
          ? countPendingPicturesNearRtu(pendingItems, rtu.lat, rtu.lng)
          : 0
      infoWindowRef.current.setContent(
        buildDetailInfoHtml(type, data, {
          buildingAddress: building?.address,
          pendingPictureAssignCount,
        }),
      )
      infoWindowRef.current.open({ map, anchor: marker })
      ensureInfoWindowVisible(map, infoWindowRef.current)
      activeInfoMarkerRef.current = marker
      setAppMarkerVisible(marker, true)
      afterMapViewChange(map)
    },
    [map, clearActiveRtuPictures],
  )

  const stopSoloMove = useCallback(() => {
    const solo = soloMoveRef.current
    if (!solo) return
    const globalDrag = useSelectionStore.getState().dragMode
    setAppMarkerDraggable(solo.marker, globalDrag)
    setAppMarkerCursor(solo.marker, globalDrag ? 'grab' : null)
    if (soloMoveListenerRef.current) {
      google.maps.event.removeListener(soloMoveListenerRef.current)
      soloMoveListenerRef.current = null
    }
    soloMoveRef.current = null
  }, [])

  const startSoloMove = useCallback(
    (marker: AppMapMarker, label?: AppMapMarker) => {
      stopSoloMove()
      infoWindowRef.current?.close()
      activeInfoMarkerRef.current = null
      soloMoveRef.current = { marker, label }
      setAppMarkerDraggable(marker, true)
      setAppMarkerCursor(marker, 'grab')
      showToastSuccess('↔ Drag marker to reposition.')
      soloMoveListenerRef.current = addAppMarkerListener(marker, 'dragend', () => {
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
        activeDetailInfoRef.current = null
        clearActiveRtuPictures()
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
          startSoloMove(entry.marker)
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

      container.querySelector('[data-iw-action="pictures"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.entry.type !== 'rtu') return
        ctx.view = 'pictures'
        ctx.pictureIndex = 0
        void refreshRtuPicturesView()
      })

      container.querySelector('[data-iw-action="picture-assign-pending"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.entry.type !== 'rtu' || !ctx.entry.building) return
        const rtu = ctx.entry.data as Rtu
        const building = ctx.entry.building
        const items = usePendingRtuPictureStore.getState().items
        const nearest = findNearestPendingPictureToRtu(items, rtu.lat, rtu.lng)
        if (!nearest) {
          showToastError(
            `No pending photos within ${RTU_PICTURE_DROP_FEET} ft of ${rtu.name}. Drag photo markers closer first.`,
          )
          return
        }
        void usePendingRtuPictureStore
          .getState()
          .assignToRtu(nearest.item.id, building, rtu)
          .then((result) => {
            showToastSuccess(`✓ Assigned ${nearest.item.originalName} → ${result.fileName} (${rtu.name})`)
            const remaining = countPendingPicturesNearRtu(
              usePendingRtuPictureStore.getState().items,
              rtu.lat,
              rtu.lng,
            )
            if (ctx.view === 'info') {
              infoWindowRef.current?.setContent(
                buildDetailInfoHtml('rtu', rtu, {
                  buildingAddress: building.address,
                  pendingPictureAssignCount: remaining,
                }),
              )
            }
          })
          .catch((error) => {
            showToastError(error instanceof Error ? error.message : 'Failed to assign picture')
          })
      })

      container.querySelector('[data-iw-action="pictures-back"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx) return
        clearActiveRtuPictures()
        ctx.view = 'info'
        ctx.pictureIndex = 0
        const { type, data, building } = ctx.entry
        iw.setContent(buildDetailInfoHtml(type, data, { buildingAddress: building?.address }))
      })

      const stepPicture = (delta: number) => {
        const ctx = activeDetailInfoRef.current
        const total = activeRtuPicturesRef.current.length
        if (!ctx || ctx.view !== 'pictures' || total <= 1) return
        ctx.pictureIndex = (ctx.pictureIndex + delta + total) % total
        void refreshRtuPicturesView()
      }

      container.querySelector('[data-iw-action="picture-prev"]')?.addEventListener('click', () => {
        stepPicture(-1)
      })
      container.querySelector('[data-iw-action="picture-next"]')?.addEventListener('click', () => {
        stepPicture(1)
      })

      container.querySelector('[data-iw-action="picture-open-viewer"]')?.addEventListener('click', () => {
        const ctx = activeDetailInfoRef.current
        if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return
        const buildingAddress = ctx.entry.building?.address
        if (!buildingAddress) return
        void listRtuPictures(buildingAddress, ctx.entry.data.name).then((pictures) => {
          if (!pictures.length) return
          activeRtuPicturesRef.current = pictures
          const pictureIndex = Math.min(ctx.pictureIndex, pictures.length - 1)
          useUiStore.getState().openRtuPictureViewer({
            pictures: pictures.map((p) => ({
              fileName: p.fileName,
              fullUrl: p.fullUrl,
              thumbUrl: p.thumbUrl,
              index: p.index,
            })),
            index: pictureIndex,
            buildingAddress,
            rtuName: ctx.entry.data.name,
          })
        })
      })

      container.querySelector('[data-iw-action="picture-add"]')?.addEventListener('click', () => {
        const input = container.querySelector('[data-iw-picture-input]') as HTMLInputElement | null
        input?.click()
      })

      const fileInput = container.querySelector('[data-iw-picture-input]') as HTMLInputElement | null
      fileInput?.addEventListener('change', () => {
        void (async () => {
          const ctx = activeDetailInfoRef.current
          if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures') return
          const buildingAddress = ctx.entry.building?.address
          if (!buildingAddress || !fileInput.files?.length) return
          const added = await addRtuPicturesFromFiles(
            buildingAddress,
            ctx.entry.data.name,
            [...fileInput.files],
          )
          fileInput.value = ''
          if (added.length) {
            ctx.pictureIndex = added.length - 1
            showToastSuccess(`✓ ${added.length} picture${added.length === 1 ? '' : 's'} added`)
          }
          await refreshRtuPicturesView()
        })()
      })

      container.querySelector('[data-iw-action="picture-delete"]')?.addEventListener('click', () => {
        void (async () => {
          const ctx = activeDetailInfoRef.current
          const btn = container.querySelector('[data-iw-action="picture-delete"]') as HTMLElement | null
          if (!ctx || ctx.entry.type !== 'rtu' || ctx.view !== 'pictures' || !btn) return

          const fileName = btn.getAttribute('data-iw-picture-file') ?? ''
          const isStatic = btn.getAttribute('data-iw-picture-static') === '1'
          const buildingAddress = ctx.entry.building?.address
          if (!buildingAddress || !fileName) return

          if (isStatic) {
            hideRtuManifestPicture(
              rtuPictureKey(buildingAddress, ctx.entry.data.name),
              fileName,
            )
            notifyRtuPicturesChanged()
            showToastSuccess(
              '✓ Picture hidden — use Settings → Sync to Cloudflare & GitHub to hide for everyone.',
            )
            await refreshRtuPicturesView()
            return
          }

          if (!window.confirm(`Delete picture "${fileName}"?`)) return

          const result = await deleteRtuPicture(buildingAddress, ctx.entry.data.name, fileName)
          if (result === 'deleted') {
            showToastSuccess('✓ Picture deleted')
            await refreshRtuPicturesView()
          }
        })()
      })
    })
  }, [startSoloMove, clearActiveRtuPictures, refreshRtuPicturesView])

  const refreshDetailVisibility = useCallback(() => {
    if (!map) return
    if (isGroupDragActive()) return

    const zoom = map.getZoom() ?? 0
    const bounds = map.getBounds()
    const activeLayers = layersRef.current
    const editMode = useSelectionStore.getState().dragMode
    const selected = new Set(useSelectionStore.getState().dragSelectedKeys)

    for (const dm of detailMarkersRef.current) {
      const pos = getAppMarkerPosition(dm.marker)
      const layerOn = activeLayers[dm.type]
      const zoomOk = zoom >= 16
      const inBounds = Boolean(bounds && pos && bounds.contains(pos))
      const show =
        layerOn &&
        zoomOk &&
        (editMode && selected.has(dm.dragKey) ? true : inBounds)
      setAppMarkerVisible(dm.marker, show)
    }
  }, [map])

  const refreshRtuPictureBadges = useCallback(async () => {
    if (!map) return
    const [counts, manifest] = await Promise.all([
      getRtuPictureCountMap(),
      loadRtuPictureManifest(),
    ])

    detailMarkersRef.current = detailMarkersRef.current.map((dm) => {
      if (dm.type !== 'rtu' || !dm.building) {
        return { ...dm, pictureCount: 0 }
      }

      const key = rtuPictureKey(dm.building.address, dm.data.name)
      const manifestKey = resolveManifestRtuKey(dm.building.address, dm.data.name, manifest)
      const count = Math.max(counts.get(key) ?? 0, counts.get(manifestKey) ?? 0)
      const updated = { ...dm, pictureCount: count }
      syncDetailMarkerAppearance(updated)
      return updated
    })

    refreshDetailVisibility()
  }, [map, refreshDetailVisibility])

  const fitAllMarkers = useCallback(() => {
    if (!map) return
    const editMode = useSelectionStore.getState().dragMode
    const bounds = new google.maps.LatLngBounds()
    const visibleSet = new Set(mapBuildings.map((b) => b.address))
    for (const entry of buildingMarkersRef.current) {
      if (!editMode && !visibleSet.has(entry.building.address)) {
        setAppMarkerVisible(entry.marker, false)
        setAppMarkerVisible(entry.label, false)
        continue
      }
      setAppMarkerVisible(entry.marker, true)
      setAppMarkerVisible(entry.label, true)
      const pos = getAppMarkerPosition(entry.marker)
      if (pos) bounds.extend(pos)
    }
    if (!bounds.isEmpty()) {
      fitBoundsPreserveRotation(map, bounds, MAP_BUILDING_FIT_PADDING)
    }
    refreshDetailVisibility()
  }, [map, mapBuildings, refreshDetailVisibility])

  const showAllMarkers = useCallback(() => {
    if (!map) return
    for (const entry of buildingMarkersRef.current) {
      setAppMarkerVisible(entry.marker, true)
      setAppMarkerVisible(entry.label, true)
    }
    fitMapToBuildingMarkers(map, buildingMarkersRef.current)
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

    infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 360, disableAutoPan: true })
    infoWindowRef.current.addListener('closeclick', () => {
      activeInfoMarkerRef.current = null
      activeDetailInfoRef.current = null
      clearActiveRtuPictures()
    })
    infoWindowRef.current.addListener('content_changed', attachInfoWindowActions)

    buildingMarkersRef.current = []
    detailMarkersRef.current = []

    for (const b of buildings) {
      const color = getColor(b.park)
      const marker = createAppMarker({
        map,
        position: { lat: b.lat, lng: b.lng },
        title: b.address,
        icon: getMarkerIcon(color, false),
        zIndex: 10,
        draggable: dragMode,
      })

      addAppMarkerListener(marker, 'click', (e: google.maps.MapMouseEvent) => {
        suppressMapClickClearOnce()
        if (useUiStore.getState().addMarkerPickMode || useUiStore.getState().polygonDrawMode) return
        if (useSelectionStore.getState().dragMode) {
          const domEvent = e.domEvent as MouseEvent | undefined
          const additive = Boolean(domEvent?.ctrlKey || domEvent?.metaKey || domEvent?.shiftKey)
          useSelectionStore.getState().toggleDragSelect(buildingDragKey(b.address), additive)
          refreshDragSelectionStyles()
          return
        }
        callbacksRef.current.onSelectBuilding(b)
        openBuildingInfo(b, marker)
      })

      const labelText = b.address.length > 24 ? `${b.address.slice(0, 22)}…` : b.address
      const label = createAppMarker({
        map,
        position: { lat: b.lat, lng: b.lng },
        label: {
          text: labelText,
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: '500',
          fontFamily: 'Inter,sans-serif',
          className: 'bldg-label',
        },
        labelOffsetY: 21,
        zIndex: 5,
        clickable: false,
      })

      addAppMarkerListener(marker, 'dragstart', () => {
        const startPos = getAppMarkerPosition(marker)
        if (!startPos) return
        const startLat = startPos.lat()
        const startLng = startPos.lng()
        const anchorKey = buildingDragKey(b.address)
        beginDragSession(anchorKey, startLat, startLng)
        if (!isGroupDragActive()) {
          setLastDragUndo(() => {
            setAppMarkerPosition(marker, startLat, startLng)
            setAppMarkerPosition(label, startLat, startLng)
            callbacksRef.current.onBuildingMoved?.(b, startLat, startLng)
          })
        }
      })

      addAppMarkerListener(marker, 'drag', () => {
        if (!isGroupDragActive()) return
        const pos = getAppMarkerPosition(marker)
        if (!pos) return
        applyGroupDragDelta({ lat: pos.lat(), lng: pos.lng() })
      })

      addAppMarkerListener(marker, 'dragend', () => {
        if (isGroupDragActive()) {
          commitGroupDrag()
          return
        }
        const pos = getAppMarkerPosition(marker)
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        setAppMarkerPosition(label, lat, lng)
        callbacksRef.current.onBuildingMoved?.(b, lat, lng)
      })

      buildingMarkersRef.current.push({ building: b, marker, label })
      registerMarqueeTarget(buildingDragKey(b.address), {
        kind: 'point',
        resolve: () => {
          const pos = getAppMarkerPosition(marker)
          return pos ? { lat: pos.lat(), lng: pos.lng() } : null
        },
      })
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
      const dragKey =
        building != null
          ? detailDragKey(layerKey, data.name ?? '', building.address)
          : 'utility_type' in data
            ? utilityDragKey(data)
            : detailDragKey(layerKey, data.name ?? '', '')
      const marker = createAppMarker({
        map,
        position: { lat, lng },
        title: data.name ?? '',
        content: buildDetailMarkerContent({
          icon: getDetailMarkerIcon(cfg.fill, cfg.stroke, {
            shapeIndex: data.marker_shape,
            scale: data.marker_scale,
            defaultScale: cfg.scale,
          }),
          label: data.name
            ? {
                text:
                  layerKey === 'hydrant' ? 'Hydrant' : layerKey === 'gas' ? 'Gas Meter' : data.name,
                color: cfg.fill,
                fontSize: layerKey === 'rtu' ? '11px' : '9px',
                fontWeight: layerKey === 'rtu' ? '500' : '700',
                fontFamily: 'Inter,sans-serif',
                className: layerKey === 'rtu' ? 'rtu-marker-label' : 'rtu-label',
              }
            : undefined,
          labelOffsetY: layerKey === 'rtu' ? -7 : -4,
          pictureCount: 0,
        }),
        zIndex: 20,
        draggable: dragMode,
      })
      setAppMarkerVisible(marker, false)

      const entry: DetailMarkerEntry = { type: layerKey, building, data, marker, dragKey }

      if (layerKey === 'rtu' && building && data.name) {
        registerRtuDropTarget(rtuDropTargetKey(building.address, data.name), marker, 20)
      }

      addAppMarkerListener(marker, 'click', (e: google.maps.MapMouseEvent) => {
        suppressMapClickClearOnce()
        if (useUiStore.getState().addMarkerPickMode || useUiStore.getState().polygonDrawMode) return
        if (useSelectionStore.getState().dragMode) {
          const domEvent = e.domEvent as MouseEvent | undefined
          const additive = Boolean(domEvent?.ctrlKey || domEvent?.metaKey || domEvent?.shiftKey)
          useSelectionStore.getState().toggleDragSelect(dragKey, additive)
          refreshDragSelectionStyles()
          return
        }
        openDetailInfo(entry)
      })

      addAppMarkerListener(marker, 'dragstart', () => {
        const startPos = getAppMarkerPosition(marker)
        if (!startPos) return
        const startLat = startPos.lat()
        const startLng = startPos.lng()
        beginDragSession(dragKey, startLat, startLng)
        if (!isGroupDragActive()) {
          setLastDragUndo(() => {
            syncDetailMarkerPositions(entry, startLat, startLng)
            callbacksRef.current.onDetailMoved?.(layerKey, data, startLat, startLng, building)
          })
        }
      })

      addAppMarkerListener(marker, 'drag', () => {
        if (!isGroupDragActive()) return
        const pos = getAppMarkerPosition(marker)
        if (!pos) return
        applyGroupDragDelta({ lat: pos.lat(), lng: pos.lng() })
      })

      addAppMarkerListener(marker, 'dragend', () => {
        if (isGroupDragActive()) {
          commitGroupDrag()
          return
        }
        const pos = getAppMarkerPosition(marker)
        if (!pos) return
        const lat = pos.lat()
        const lng = pos.lng()
        syncDetailMarkerPositions(entry, lat, lng)
        callbacksRef.current.onDetailMoved?.(layerKey, data, lat, lng, building)
      })

      detailMarkersRef.current.push(entry)
      registerMarqueeTarget(dragKey, {
        kind: 'point',
        resolve: () => {
          const pos = getAppMarkerPosition(marker)
          return pos ? { lat: pos.lat(), lng: pos.lng() } : null
        },
      })
    }

    for (const b of buildings) {
      for (const r of b.rtus ?? []) {
        if (isLegacySuiteMarkerName(r.name)) continue
        makeDetailMarker(r.lat, r.lng, 'rtu', r, b)
      }
    }

    for (const u of utilities) {
      const layerKey = UTILITY_LAYER_MAP[u.utility_type] ?? 'sprinkler'
      makeDetailMarker(u.lat, u.lng, layerKey, u, null)
    }

    map.addListener('zoom_changed', refreshDetailVisibility)
    map.addListener('idle', refreshDetailVisibility)

    if (!hasInitialBuildingFitRef.current && buildingMarkersRef.current.length > 0) {
      hasInitialBuildingFitRef.current = true
      const entries = buildingMarkersRef.current
      google.maps.event.addListenerOnce(map, 'idle', () => {
        fitMapToBuildingMarkers(map, entries)
      })
    }

    void refreshRtuPictureBadges()

    return () => {
      clearAllRtuDropTargets()
      for (const entry of buildingMarkersRef.current) {
        unregisterMarqueeTarget(buildingDragKey(entry.building.address))
        setAppMarkerMap(entry.marker, null)
      }
      for (const entry of detailMarkersRef.current) {
        if (entry.type === 'rtu' && entry.building && entry.data.name) {
          unregisterRtuDropTarget(rtuDropTargetKey(entry.building.address, entry.data.name))
        }
        unregisterMarqueeTarget(entry.dragKey)
        setAppMarkerMap(entry.marker, null)
      }
      buildingMarkersRef.current = []
      detailMarkersRef.current = []
      infoWindowRef.current?.close()
      infoWindowRef.current = null
      stopSoloMove()
    }
  }, [
    map,
    buildings,
    utilities,
    openBuildingInfo,
    openDetailInfo,
    attachInfoWindowActions,
    refreshDetailVisibility,
    refreshRtuPictureBadges,
    stopSoloMove,
    beginDragSession,
    commitGroupDrag,
    refreshDragSelectionStyles,
    dragMode,
    clearActiveRtuPictures,
    setLastDragUndo,
  ])

  useEffect(() => {
    refreshDetailVisibility()
  }, [layers, refreshDetailVisibility])

  useEffect(() => {
    return onRtuPicturesChanged(() => {
      void refreshRtuPictureBadges()
      void refreshRtuPicturesView()
    })
  }, [refreshRtuPictureBadges, refreshRtuPicturesView])

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
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (tryConsumeMapAddMarkerPick(e.latLng)) return
      if (consumeMapClickClearSuppression()) return
      if (useSelectionStore.getState().dragMode) {
        useSelectionStore.getState().clearDragSelect()
        refreshDragSelectionStyles()
      }
      closeAllMapPopups()
    })
    return () => google.maps.event.removeListener(listener)
  }, [map, refreshDragSelectionStyles])

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
      panToPreserveRotation(map, { lat: entry.data.lat, lng: entry.data.lng }, MAP_DETAIL_ZOOM, {
        onlyZoomIn: true,
      })
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
      panToPreserveRotation(map, { lat: entry.building.lat, lng: entry.building.lng }, MAP_DETAIL_ZOOM, {
        onlyZoomIn: true,
      })
      callbacksRef.current.onSelectBuilding(entry.building)
      openBuildingInfo(entry.building, entry.marker)
    }
    window.addEventListener('map:openBuilding', handler)
    return () => window.removeEventListener('map:openBuilding', handler)
  }, [map, openBuildingInfo])

  const visibleAddressesRef = useRef('')
  const lastFocusedBuildingRef = useRef<string | null>(null)
  const openBuildingInfoRef = useRef(openBuildingInfo)

  useEffect(() => {
    openBuildingInfoRef.current = openBuildingInfo
  })

  useEffect(() => {
    if (!map) return
    const q = search.trim()
    if (q && collectSearchHits(buildings, polygons, q).length > 0) {
      return
    }

    const addressKey = mapBuildings
      .map((b) => b.address)
      .sort()
      .join('\n')
    const fitKey = `map:${addressKey}`
    if (fitKey === visibleAddressesRef.current) {
      return
    }
    visibleAddressesRef.current = fitKey
    fitAllMarkers()
  }, [map, mapBuildings, fitAllMarkers, buildings, polygons, search])

  useEffect(() => {
    if (
      useUiStore.getState().addMarkerPickMode ||
      useUiStore.getState().polygonDrawMode ||
      useUiStore.getState().isModalOpen('addMarker')
    ) {
      return
    }
    if (!currentBuilding) {
      lastFocusedBuildingRef.current = null
      return
    }

    const address = currentBuilding.address
    const isNewSelection = lastFocusedBuildingRef.current !== address
    lastFocusedBuildingRef.current = address

    highlightBuilding(currentBuilding)
    if (!map || !isNewSelection) return

    const entry = buildingMarkersRef.current.find(
      (m) => m.building.address === currentBuilding.address,
    )
    if (entry) {
      panToPreserveRotation(
        map,
        { lat: currentBuilding.lat, lng: currentBuilding.lng },
        MAP_DETAIL_ZOOM,
        { onlyZoomIn: true },
      )
      openBuildingInfoRef.current(currentBuilding, entry.marker)
      setTimeout(() => {
        document.querySelector('.building-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 60)
    }
  }, [currentBuilding, map, highlightBuilding])

  useEffect(() => {
    refreshDetailVisibility()
  }, [layers, dragMode, dragSelectedKeys, refreshDetailVisibility])

  const addMarkerPickMode = useUiStore((s) => s.addMarkerPickMode)
  const polygonDrawMode = useUiStore((s) => s.polygonDrawMode)
  const blockMarkerClicks = addMarkerPickMode || polygonDrawMode

  useEffect(() => {
    for (const entry of buildingMarkersRef.current) {
      const isSolo = soloMoveRef.current?.marker === entry.marker
      setAppMarkerDraggable(entry.marker, dragMode || isSolo)
      setAppMarkerClickable(entry.marker, !blockMarkerClicks)
      if (!isSolo) setAppMarkerCursor(entry.marker, dragMode ? 'grab' : null)
    }
    for (const entry of detailMarkersRef.current) {
      const isSolo = soloMoveRef.current?.marker === entry.marker
      setAppMarkerDraggable(entry.marker, dragMode || isSolo)
      setAppMarkerClickable(entry.marker, !blockMarkerClicks)
      if (!isSolo) setAppMarkerCursor(entry.marker, dragMode ? 'grab' : null)
    }
  }, [dragMode, blockMarkerClicks])

  return {
    fitAllMarkers,
    showAllMarkers,
    cycleImagery,
    refreshDetailVisibility,
    buildingMarkersRef,
    detailMarkersRef,
  }
}
