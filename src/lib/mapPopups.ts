import { afterMapViewChange } from '@/lib/mapRotation'

export const MAP_CLOSE_POPUPS_EVENT = 'map:closePopups'

let suppressInfoWindowCloseResetCount = 0

/** Ignore the next InfoWindow closeclick state reset (marker badge refresh / setContent). */
export function suppressInfoWindowCloseReset(): void {
  suppressInfoWindowCloseResetCount++
}

export function releaseInfoWindowCloseReset(): void {
  if (suppressInfoWindowCloseResetCount > 0) suppressInfoWindowCloseResetCount--
}

export function shouldSuppressInfoWindowCloseReset(): boolean {
  return suppressInfoWindowCloseResetCount > 0
}

/** Close building, RTU/detail, and polygon InfoWindows. */
export function closeAllMapPopups(): void {
  window.dispatchEvent(new CustomEvent(MAP_CLOSE_POPUPS_EVENT))
}

/** Pan the map so an InfoWindow opened with disableAutoPan stays fully on screen. */
export function ensureInfoWindowVisible(
  map: google.maps.Map,
  infoWindow: google.maps.InfoWindow,
  padding = 12,
): void {
  google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
    const mapDiv = map.getDiv()
    const iwNode = mapDiv.querySelector('.gm-style-iw-c') as HTMLElement | null
    if (!iwNode) return

    const mapRect = mapDiv.getBoundingClientRect()
    const iwRect = iwNode.getBoundingClientRect()
    let dx = 0
    let dy = 0

    if (iwRect.top < mapRect.top + padding) {
      dy = iwRect.top - mapRect.top - padding
    } else if (iwRect.bottom > mapRect.bottom - padding) {
      dy = iwRect.bottom - mapRect.bottom + padding
    }

    if (iwRect.left < mapRect.left + padding) {
      dx = iwRect.left - mapRect.left - padding
    } else if (iwRect.right > mapRect.right - padding) {
      dx = iwRect.right - mapRect.right + padding
    }

    if (dx !== 0 || dy !== 0) {
      map.panBy(dx, dy)
      afterMapViewChange(map)
    }
  })
}
