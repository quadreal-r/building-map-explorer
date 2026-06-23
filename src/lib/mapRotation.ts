import { useMapRotationStore } from '@/stores/mapRotationStore'

function headingDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

export function applyStoredRotation(map: google.maps.Map): void {
  const { heading, tilt } = useMapRotationStore.getState()
  map.setHeading(heading)
  map.setTilt(tilt)
}

/** Keep map aligned with stored rotation when Maps resets heading (e.g. InfoWindow auto-pan). */
export function installRotationGuard(map: google.maps.Map): google.maps.MapsEventListener {
  const enforce = () => {
    const { heading, tilt } = useMapRotationStore.getState()
    const currentH = map.getHeading() || 0
    const currentT = map.getTilt() || 0
    if (headingDiff(currentH, heading) > 0.5) map.setHeading(heading)
    if (Math.abs(currentT - tilt) > 0.5) map.setTilt(tilt)
  }
  return map.addListener('idle', enforce)
}

/** Re-apply rotation after pan/zoom/fitBounds/InfoWindow (Maps may reset heading on idle). */
export function afterMapViewChange(map: google.maps.Map): void {
  applyStoredRotation(map)
  const listener = map.addListener('idle', () => {
    applyStoredRotation(map)
    google.maps.event.removeListener(listener)
  })
}

export function panToPreserveRotation(
  map: google.maps.Map,
  center: google.maps.LatLngLiteral,
  zoom?: number,
): void {
  map.panTo(center)
  if (zoom != null) map.setZoom(zoom)
  afterMapViewChange(map)
}

export function fitBoundsPreserveRotation(
  map: google.maps.Map,
  bounds: google.maps.LatLngBounds,
  padding?: number | google.maps.Padding,
): void {
  map.fitBounds(bounds, padding)
  afterMapViewChange(map)
}
