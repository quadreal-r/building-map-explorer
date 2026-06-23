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
  const shape = MARKER_SHAPES[markerShapeIdx]!
  const scale = isSelected ? markerScale * 1.55 : markerScale
  const strokeWeight = isSelected ? 3 : 1.5
  const path = shape.isBuiltin ? google.maps.SymbolPath.CIRCLE : shape.path
  return {
    path,
    fillColor: color,
    fillOpacity: isSelected ? 1 : 0.95,
    strokeColor: '#fff',
    strokeWeight,
    scale,
  }
}
