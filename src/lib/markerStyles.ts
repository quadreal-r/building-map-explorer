/** Marker shape + scale config from legacy HTML MARKER_SHAPES / _getMarkerIcon. */

export interface MarkerShape {
  label: string
  path: string
  isBuiltin: boolean
}

export const MARKER_SHAPES: MarkerShape[] = [
  { label: '●  Circle', path: 'CIRCLE', isBuiltin: true },
  { label: '◆  Diamond', path: 'M 0,-1 1,0 0,1 -1,0 Z', isBuiltin: false },
  { label: '■  Square', path: 'M -1,-1 1,-1 1,1 -1,1 Z', isBuiltin: false },
  {
    label: '★  Star',
    path: 'M 0,-1 0.22,-0.31 0.95,-0.31 0.36,0.12 0.59,0.81 0,-0.25 -0.59,0.81 -0.36,0.12 -0.95,-0.31 -0.22,-0.31 Z',
    isBuiltin: false,
  },
  { label: '▲  Triangle', path: 'M 0,-1.1 1,0.8 -1,0.8 Z', isBuiltin: false },
]

let markerShapeIdx = 0
let markerScale = 9

export function getMarkerShapeIndex(): number {
  return markerShapeIdx
}

export function setMarkerShapeIndex(index: number): void {
  markerShapeIdx = Math.max(0, Math.min(MARKER_SHAPES.length - 1, index))
}

export function getMarkerScale(): number {
  return markerScale
}

export function setMarkerScale(scale: number): void {
  markerScale = Math.max(4, Math.min(20, scale))
}

export function getMarkerIcon(color: string, isSelected = false): google.maps.Symbol {
  const scale = isSelected ? 9 * 1.55 : 9
  const strokeWeight = isSelected ? 3 : 1.5
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: isSelected ? 1 : 0.95,
    strokeColor: '#fff',
    strokeWeight,
    scale,
  }
}

export interface DetailMarkerIconOptions {
  shapeIndex?: number
  scale?: number
  /** Circle scale for legacy/imported markers without custom shape. */
  defaultScale?: number
}

/** RTU / utility pin icon — uses per-marker shape when stored, else legacy circle. */
export function getDetailMarkerIcon(
  fillColor: string,
  strokeColor: string,
  options: DetailMarkerIconOptions = {},
): google.maps.Symbol {
  const { shapeIndex, scale, defaultScale = 5 } = options
  const hasCustomShape = shapeIndex != null

  if (!hasCustomShape && scale == null) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor,
      fillOpacity: 0.9,
      strokeColor,
      strokeWeight: 1,
      scale: defaultScale,
    }
  }

  const shape = MARKER_SHAPES[shapeIndex ?? 0]!
  const path = shape.isBuiltin ? google.maps.SymbolPath.CIRCLE : shape.path
  return {
    path,
    fillColor,
    fillOpacity: 0.9,
    strokeColor,
    strokeWeight: 1,
    scale: scale ?? defaultScale,
  }
}
