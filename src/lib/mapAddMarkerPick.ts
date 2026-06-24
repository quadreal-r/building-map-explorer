import { useUiStore } from '@/stores/uiStore'

export type { AddMarkerClickHandler } from '@/stores/uiStore'

export function setMapAddMarkerPickHandler(
  handler: ((lat: number, lng: number) => void) | null,
): void {
  useUiStore.getState().setAddMarkerClickHandler(handler)
}

export function isMapAddMarkerPickActive(): boolean {
  return useUiStore.getState().addMarkerClickHandler != null
}

/** Returns true when the click was consumed for add-marker placement. */
export function tryConsumeMapAddMarkerPick(
  latLng: google.maps.LatLng | null | undefined,
): boolean {
  const handler = useUiStore.getState().addMarkerClickHandler
  if (!handler || !latLng) return false
  useUiStore.getState().setAddMarkerClickHandler(null)
  handler(latLng.lat(), latLng.lng())
  return true
}

const MAP_CLICK_IGNORE =
  'button, a, input, select, textarea, .gm-bundled-control, .gm-style-cc, .gm-style-iw, [data-add-marker-panel]'

function shouldIgnoreMapPickTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  return Boolean(target.closest(MAP_CLICK_IGNORE))
}

/** Permanent map listeners for add-marker placement (Maps API click + DOM fallback). */
export function installMapAddMarkerPick(map: google.maps.Map): () => void {
  const mapListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
    tryConsumeMapAddMarkerPick(e.latLng)
  })

  const overlay = new google.maps.OverlayView()
  overlay.onAdd = () => {}
  overlay.draw = () => {}
  overlay.setMap(map)

  const container = map.getDiv()
  const onDomClick = (event: MouseEvent) => {
    if (!useUiStore.getState().addMarkerClickHandler || event.button !== 0) return
    if (shouldIgnoreMapPickTarget(event.target)) return

    const projection = overlay.getProjection()
    if (!projection) return

    const rect = container.getBoundingClientRect()
    const point = new google.maps.Point(
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
    tryConsumeMapAddMarkerPick(projection.fromContainerPixelToLatLng(point))
  }

  container.addEventListener('click', onDomClick, true)

  return () => {
    google.maps.event.removeListener(mapListener)
    container.removeEventListener('click', onDomClick, true)
    overlay.setMap(null)
  }
}
