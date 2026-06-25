import { describe, expect, it } from 'vitest'
import {
  buildBulkRtuPictureFileName,
  formatRtuNameForPictureFile,
} from '@/lib/rtuPictureAssignNaming'
import { findNearestRtuAt } from '@/lib/rtuPictureGpsAssign'
import type { Building } from '@/types/domain'

describe('formatRtuNameForPictureFile', () => {
  it('preserves spaces in Hybrid and other descriptors', () => {
    expect(formatRtuNameForPictureFile('RTU-06 Hybrid')).toBe('RTU-06 Hybrid')
    expect(formatRtuNameForPictureFile('RTU- 04')).toBe('RTU- 04')
  })
})

describe('buildBulkRtuPictureFileName', () => {
  it('uses displayed RTU name with spaces', () => {
    expect(buildBulkRtuPictureFileName('2320 Main St', 'RTU-06 Hybrid', 3, 'jpg')).toBe(
      '2320-RTU-06 Hybrid (3).jpg',
    )
  })

  it('keeps spacing from portfolio RTU name', () => {
    expect(buildBulkRtuPictureFileName('2320 Main St', 'RTU- 4B', 3, 'jpg')).toBe(
      '2320-RTU- 4B (3).jpg',
    )
    expect(buildBulkRtuPictureFileName('100 Leek Crescent', 'RTU- 01', 1, 'jpeg')).toBe(
      '100-RTU- 01 (1).jpeg',
    )
  })
})

describe('findNearestRtuAt', () => {
  const buildings: Building[] = [
    {
      park: 'P',
      address: '100 Test Rd',
      bu: '1',
      lat: 43.6,
      lng: -79.4,
      sqft: '1',
      cluster: 'C',
      manager: 'M',
      rtus: [
        { name: 'RTU- 01', description: '', lat: 43.6001, lng: -79.4001 },
        { name: 'RTU- 02', description: '', lat: 43.61, lng: -79.41 },
      ],
    },
  ]

  it('returns nearest RTU within range', () => {
    const match = findNearestRtuAt(buildings, 43.6001, -79.4001, 100)
    expect(match?.rtu.name).toBe('RTU- 01')
  })

  it('returns null when too far', () => {
    expect(findNearestRtuAt(buildings, 43.7, -79.5, 50)).toBeNull()
  })
})
