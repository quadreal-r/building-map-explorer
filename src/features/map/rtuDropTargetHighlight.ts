import {
  getAppMarkerPosition,
  setAppMarkerZIndex,
  type AppMapMarker,
} from '@/lib/appMapMarker'
import { RTU_PICTURE_DROP_FEET } from '@/lib/geo'
import { findNearestRtuAt } from '@/lib/rtuPictureGpsAssign'
import type { Building } from '@/types/domain'

const DROP_TARGET_SCALE = 1.45
const DROP_TARGET_TRANSITION = 'transform 0.18s ease-out'

interface DropTargetEntry {
  marker: AppMapMarker
  baseZIndex: number
}

const targetsByKey = new Map<string, DropTargetEntry>()
let highlightedKey: string | null = null

export function rtuDropTargetKey(buildingAddress: string, rtuName: string): string {
  return `${buildingAddress}|${rtuName}`
}

function prepareDropTargetElement(marker: AppMapMarker): void {
  const el = marker.content
  if (!(el instanceof HTMLElement)) return
  el.style.transformOrigin = '50% 50%'
  el.style.transition = DROP_TARGET_TRANSITION
}

function applyDropTargetHighlight(entry: DropTargetEntry, active: boolean): void {
  const el = entry.marker.content
  if (!(el instanceof HTMLElement)) return
  prepareDropTargetElement(entry.marker)
  el.style.transform = active ? `scale(${DROP_TARGET_SCALE})` : 'scale(1)'
  setAppMarkerZIndex(entry.marker, active ? 3000 : entry.baseZIndex)
}

export function registerRtuDropTarget(
  key: string,
  marker: AppMapMarker,
  baseZIndex = 20,
): void {
  targetsByKey.set(key, { marker, baseZIndex })
  prepareDropTargetElement(marker)
  if (highlightedKey === key) {
    applyDropTargetHighlight(targetsByKey.get(key)!, true)
  }
}

export function unregisterRtuDropTarget(key: string): void {
  if (highlightedKey === key) {
    highlightedKey = null
  }
  targetsByKey.delete(key)
}

export function clearAllRtuDropTargets(): void {
  clearRtuDropTargetHighlight()
  targetsByKey.clear()
}

export function clearRtuDropTargetHighlight(): void {
  if (!highlightedKey) return
  const entry = targetsByKey.get(highlightedKey)
  if (entry) {
    applyDropTargetHighlight(entry, false)
  }
  highlightedKey = null
}

export function setRtuDropTargetHighlight(key: string | null): void {
  if (key === highlightedKey) return

  if (highlightedKey) {
    const previous = targetsByKey.get(highlightedKey)
    if (previous) applyDropTargetHighlight(previous, false)
  }

  highlightedKey = key

  if (key) {
    const entry = targetsByKey.get(key)
    if (entry) applyDropTargetHighlight(entry, true)
  }
}

export function updateRtuDropTargetHighlight(
  buildings: Building[],
  lat: number,
  lng: number,
): void {
  const match = findNearestRtuAt(buildings, lat, lng, RTU_PICTURE_DROP_FEET)
  if (!match) {
    setRtuDropTargetHighlight(null)
    return
  }
  setRtuDropTargetHighlight(rtuDropTargetKey(match.building.address, match.rtu.name))
}

export function updateRtuDropTargetHighlightFromMarker(
  buildings: Building[],
  marker: AppMapMarker,
): void {
  const pos = getAppMarkerPosition(marker)
  if (!pos) {
    clearRtuDropTargetHighlight()
    return
  }
  updateRtuDropTargetHighlight(buildings, pos.lat(), pos.lng())
}
