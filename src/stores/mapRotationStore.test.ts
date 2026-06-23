import { describe, expect, it, beforeEach } from 'vitest'
import { useMapRotationStore } from '@/stores/mapRotationStore'

describe('useMapRotationStore', () => {
  beforeEach(() => {
    useMapRotationStore.setState({ heading: 0, tilt: 0 })
  })

  it('stores heading from user rotation', () => {
    useMapRotationStore.getState().setHeading(42)
    expect(useMapRotationStore.getState().heading).toBe(42)
  })

  it('resetRotation clears heading and tilt', () => {
    useMapRotationStore.setState({ heading: 90, tilt: 30 })
    useMapRotationStore.getState().resetRotation()
    expect(useMapRotationStore.getState().heading).toBe(0)
    expect(useMapRotationStore.getState().tilt).toBe(0)
  })
})
