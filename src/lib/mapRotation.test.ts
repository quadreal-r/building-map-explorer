import { describe, expect, it } from 'vitest'
import { applyStoredRotation } from '@/lib/mapRotation'
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
})
