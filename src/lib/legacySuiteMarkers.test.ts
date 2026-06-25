import { describe, expect, it } from 'vitest'
import { isLegacySuiteMarkerName } from './legacySuiteMarkers'

describe('isLegacySuiteMarkerName', () => {
  it('matches suite/unit markers with hash', () => {
    expect(isLegacySuiteMarkerName('Suite # 1')).toBe(true)
    expect(isLegacySuiteMarkerName('Unit # 24')).toBe(true)
  })

  it('matches suite/unit markers without hash', () => {
    expect(isLegacySuiteMarkerName('Suite 3')).toBe(true)
    expect(isLegacySuiteMarkerName('Unit 12')).toBe(true)
  })

  it('does not match real RTU names', () => {
    expect(isLegacySuiteMarkerName('RTU-01')).toBe(false)
    expect(isLegacySuiteMarkerName('RTU- 04')).toBe(false)
  })
})
