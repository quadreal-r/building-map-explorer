import { describe, expect, it, vi } from 'vitest'
import {
  closeAllMapPopups,
  MAP_CLOSE_POPUPS_EVENT,
  releaseInfoWindowCloseReset,
  shouldSuppressInfoWindowCloseReset,
  suppressInfoWindowCloseReset,
} from '@/lib/mapPopups'

describe('mapPopups close reset suppress', () => {
  it('tracks suppress flag for nested calls', () => {
    while (shouldSuppressInfoWindowCloseReset()) releaseInfoWindowCloseReset()

    expect(shouldSuppressInfoWindowCloseReset()).toBe(false)
    suppressInfoWindowCloseReset()
    expect(shouldSuppressInfoWindowCloseReset()).toBe(true)
    releaseInfoWindowCloseReset()
    expect(shouldSuppressInfoWindowCloseReset()).toBe(false)
  })

  it('always dispatches close popups event', () => {
    const listener = vi.fn()
    window.addEventListener(MAP_CLOSE_POPUPS_EVENT, listener)
    closeAllMapPopups()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(MAP_CLOSE_POPUPS_EVENT, listener)
  })
})
