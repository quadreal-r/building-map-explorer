/** Zoom/pan math for the RTU picture viewer (IrfanView-style behaviour). */

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface DisplayMetrics {
  dw: number
  dh: number
  ox: number
  oy: number
  nw: number
  nh: number
}

export interface ZoomState {
  scale: number
  panX: number
  panY: number
}

export const DEFAULT_ZOOM: ZoomState = { scale: 1, panX: 0, panY: 0 }
export const MAX_ZOOM = 6
export const MIN_ZOOM = 1
/** IrfanView-style step zoom (~10% per +/− key). */
export const ZOOM_STEP_FACTOR = 1.1
export const PAN_STEP_PX = 48

export function isZoomed(zoom: ZoomState): boolean {
  return zoom.scale > 1.001 || Math.abs(zoom.panX) > 0.5 || Math.abs(zoom.panY) > 0.5
}

export function clampZoomScale(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export function pointInRect(x: number, y: number, rect: CropRect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

/** Zoom the displayed image so the frame selection fills the viewport. */
export function computeZoomToRect(
  rect: CropRect,
  m: DisplayMetrics,
  frameW: number,
  frameH: number,
): ZoomState {
  const ix = Math.max(m.ox, rect.x)
  const iy = Math.max(m.oy, rect.y)
  const iw = Math.min(rect.x + rect.w, m.ox + m.dw) - ix
  const ih = Math.min(rect.y + rect.h, m.oy + m.dh) - iy
  if (iw < 8 || ih < 8) return DEFAULT_ZOOM

  const lx = ix - m.ox
  const ly = iy - m.oy
  const scale = Math.min(Math.max(m.dw / iw, m.dh / ih), MAX_ZOOM)
  const panX = frameW / 2 - m.ox - (lx + iw / 2) * scale
  const panY = frameH / 2 - m.oy - (ly + ih / 2) * scale
  return { scale, panX, panY }
}

/** Zoom in/out toward a point in frame coordinates (wheel or +/−). */
export function zoomAtPoint(
  zoom: ZoomState,
  m: DisplayMetrics,
  frameX: number,
  frameY: number,
  factor: number,
): ZoomState {
  const nextScale = clampZoomScale(zoom.scale * factor)
  if (nextScale <= MIN_ZOOM) return DEFAULT_ZOOM

  const localX = (frameX - m.ox - zoom.panX) / zoom.scale
  const localY = (frameY - m.oy - zoom.panY) / zoom.scale
  const panX = frameX - m.ox - localX * nextScale
  const panY = frameY - m.oy - localY * nextScale
  return { scale: nextScale, panX, panY }
}

export function zoomAtFrameCenter(
  zoom: ZoomState,
  m: DisplayMetrics,
  frameW: number,
  frameH: number,
  factor: number,
): ZoomState {
  return zoomAtPoint(zoom, m, frameW / 2, frameH / 2, factor)
}

export function panZoom(zoom: ZoomState, deltaX: number, deltaY: number): ZoomState {
  return {
    scale: zoom.scale,
    panX: zoom.panX + deltaX,
    panY: zoom.panY + deltaY,
  }
}
