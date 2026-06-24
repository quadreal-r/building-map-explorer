import { describe, expect, it, vi } from 'vitest'
import { applyStoredRotation, panToPreserveRotation } from '@/lib/mapRotation'
import { useMapRotationStore } from '@/stores/mapRotationStore'

describe('mapRotation', () => {
  it('applyStoredRotation sets map heading and tilt from store', () => {
    useMapRotationStore.setState({ heading: 45, tilt: 10 })
    let heading = 0
    let tilt = 0
    const map = {
      setHeading: (h: number) => {
        heading = h
      },
      setTilt: (t: number) => {
        tilt = t
      },
    } as unknown as google.maps.Map

    applyStoredRotation(map)
    expect(heading).toBe(45)
    expect(tilt).toBe(10)
  })

  it('panToPreserveRotation with onlyZoomIn does not zoom out', () => {
    const panTo = vi.fn()
    const setZoom = vi.fn()
    const map = {
      panTo,
      setZoom,
      getZoom: () => 21,
      setHeading: vi.fn(),
      setTilt: vi.fn(),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
    } as unknown as google.maps.Map

    panToPreserveRotation(map, { lat: 1, lng: 2 }, 21, { onlyZoomIn: true })

    expect(panTo).toHaveBeenCalledWith({ lat: 1, lng: 2 })
    expect(setZoom).not.toHaveBeenCalled()
  })

  it('panToPreserveRotation with onlyZoomIn zooms in when below target', () => {
    const setZoom = vi.fn()
    const map = {
      panTo: vi.fn(),
      setZoom,
      getZoom: () => 18,
      setHeading: vi.fn(),
      setTilt: vi.fn(),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
    } as unknown as google.maps.Map

    panToPreserveRotation(map, { lat: 1, lng: 2 }, 21, { onlyZoomIn: true })

    expect(setZoom).toHaveBeenCalledWith(21)
  })
})
