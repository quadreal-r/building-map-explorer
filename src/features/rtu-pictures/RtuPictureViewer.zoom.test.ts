import { describe, expect, it } from 'vitest'
import {
  computeZoomToRect,
  DEFAULT_ZOOM,
  panZoom,
  zoomAtFrameCenter,
  ZOOM_STEP_FACTOR,
} from './rtuPictureViewerZoom'

describe('rtuPictureViewerZoom', () => {
  const metrics = { dw: 400, dh: 300, ox: 50, oy: 40, nw: 1600, nh: 1200 }

  it('zooms in when a sub-region is selected', () => {
    const zoom = computeZoomToRect({ x: 150, y: 90, w: 100, h: 80 }, metrics, 500, 380)
    expect(zoom.scale).toBeGreaterThan(1)
  })

  it('caps zoom at 600%', () => {
    const zoom = computeZoomToRect({ x: 50, y: 40, w: 4, h: 4 }, metrics, 500, 380)
    expect(zoom.scale).toBeLessThanOrEqual(6)
  })

  it('returns default zoom for tiny selections', () => {
    const zoom = computeZoomToRect({ x: 150, y: 90, w: 2, h: 2 }, metrics, 500, 380)
    expect(zoom.scale).toBe(1)
    expect(zoom.panX).toBe(0)
  })

  it('steps zoom at frame center', () => {
    const zoomed = zoomAtFrameCenter(DEFAULT_ZOOM, metrics, 500, 380, ZOOM_STEP_FACTOR)
    expect(zoomed.scale).toBeGreaterThan(1)
  })

  it('pans without changing scale', () => {
    const start = { scale: 2, panX: 10, panY: -5 }
    const moved = panZoom(start, 20, -10)
    expect(moved.scale).toBe(2)
    expect(moved.panX).toBe(30)
    expect(moved.panY).toBe(-15)
  })
})
