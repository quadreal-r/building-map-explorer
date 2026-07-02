import { useMapRotationStore } from '@/stores/mapRotationStore'
import { useMapViewStore } from '@/stores/mapViewStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { STORAGE_KEYS } from '@/lib/storageKeys'

export const HARD_REFRESH_VIEW_KEY = STORAGE_KEYS.hardRefreshView

export interface HardRefreshViewState {
  lat: number
  lng: number
  zoom: number
  heading: number
  tilt: number
  buildingAddress: string | null
}

type LiveMapViewReader = () => HardRefreshViewState | null

let liveMapViewReader: LiveMapViewReader | null = null
let buildingMapFocusSuppressedOnce = false
let hardRefreshViewApplied = false

/** MapPanel registers a reader so hard refresh uses the live map, not a stale idle snapshot. */
export function registerLiveMapViewReader(reader: LiveMapViewReader | null): () => void {
  liveMapViewReader = reader
  return () => {
    if (liveMapViewReader === reader) liveMapViewReader = null
  }
}

export function hasPendingHardRefreshView(): boolean {
  return readHardRefreshViewState() != null
}

export function markHardRefreshViewApplied(): void {
  hardRefreshViewApplied = true
}

export function wasHardRefreshViewApplied(): boolean {
  return hardRefreshViewApplied
}

export function suppressNextBuildingMapFocus(): void {
  buildingMapFocusSuppressedOnce = true
}

export function consumeSuppressBuildingMapFocus(): boolean {
  if (!buildingMapFocusSuppressedOnce) return false
  buildingMapFocusSuppressedOnce = false
  return true
}

export function saveHardRefreshViewState(state: HardRefreshViewState): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(HARD_REFRESH_VIEW_KEY, JSON.stringify(state))
}

export function readHardRefreshViewState(): HardRefreshViewState | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(HARD_REFRESH_VIEW_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<HardRefreshViewState>
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return null
    if (typeof data.zoom !== 'number') return null
    return {
      lat: data.lat,
      lng: data.lng,
      zoom: data.zoom,
      heading: typeof data.heading === 'number' ? data.heading : 0,
      tilt: typeof data.tilt === 'number' ? data.tilt : 0,
      buildingAddress:
        typeof data.buildingAddress === 'string' ? data.buildingAddress : null,
    }
  } catch {
    return null
  }
}

/** Read saved view once, then remove so it is not re-applied on later navigations. */
export function consumeHardRefreshViewState(): HardRefreshViewState | null {
  const state = readHardRefreshViewState()
  if (state && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(HARD_REFRESH_VIEW_KEY)
  }
  return state
}

export function buildHardRefreshViewStateFromStores(): HardRefreshViewState | null {
  const snapshot = useMapViewStore.getState().snapshot
  if (!snapshot) return null
  const { heading, tilt } = useMapRotationStore.getState()
  const buildingAddress = useSelectionStore.getState().currentBuilding?.address ?? null
  return {
    lat: snapshot.lat,
    lng: snapshot.lng,
    zoom: snapshot.zoom,
    heading,
    tilt,
    buildingAddress,
  }
}

function readHardRefreshViewStateForSave(): HardRefreshViewState | null {
  return liveMapViewReader?.() ?? buildHardRefreshViewStateFromStores()
}

/** @internal Tests and diagnostics */
export function captureHardRefreshViewState(): HardRefreshViewState | null {
  return readHardRefreshViewStateForSave()
}

/** Full page reload; restores map center, zoom, rotation, and building focus after reload. */
export function hardRefreshPreservingView(): void {
  const state = readHardRefreshViewStateForSave()
  if (state) saveHardRefreshViewState(state)
  window.location.reload()
}

export function applyHardRefreshViewToMap(
  map: google.maps.Map,
  restored: HardRefreshViewState,
): void {
  map.setCenter({ lat: restored.lat, lng: restored.lng })
  map.setZoom(restored.zoom)
  useMapRotationStore.setState({ heading: restored.heading, tilt: restored.tilt })
}
