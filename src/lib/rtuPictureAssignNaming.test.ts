import { describe, expect, it } from 'vitest'
import {
  buildBulkRtuPictureFileName,
  buildCloudRtuPictureFileName,
  formatRtuNameForPictureFile,
  manifestEntryToCloudFileName,
} from '@/lib/rtuPictureAssignNaming'
import { findNearestRtuAt } from '@/lib/rtuPictureGpsAssign'
import type { Building } from '@/types/domain'

describe('formatRtuNameForPictureFile', () => {
  it('preserves spaces in Hybrid and other descriptors', () => {
    expect(formatRtuNameForPictureFile('RTU-06 Hybrid')).toBe('RTU-06 Hybrid')
    expect(formatRtuNameForPictureFile('RTU- 04')).toBe('RTU- 04')
  })

  it('turns slash-separated suffixes into a space', () => {
    expect(formatRtuNameForPictureFile('RTU-04 Hybrid/Dual Fuel Heat Pump')).toBe(
      'RTU-04 Hybrid Dual Fuel Heat Pump',
    )
  })
})

describe('buildCloudRtuPictureFileName', () => {
  it('uses dash format without spaces for Cloudflare R2', () => {
    expect(buildCloudRtuPictureFileName('2320 Bristol Circle', 'RTU-04 Hybrid', 1, 'jpg')).toBe(
      '2320-RTU-04-1.jpg',
    )
    expect(buildCloudRtuPictureFileName('2320 Bristol Circle', 'RTU-09', 2, 'jpg')).toBe(
      '2320-RTU-09-2.jpg',
    )
  })

  it('maps legacy manifest names to cloud filenames', () => {
    expect(
      manifestEntryToCloudFileName(
        '2320-RTU-04 Hybrid (1).jpg',
        '2320 Bristol Circle',
        'RTU-04 Hybrid',
      ),
    ).toBe('2320-RTU-04-1.jpg')
  })
})

describe('buildBulkRtuPictureFileName', () => {
  it('uses displayed RTU name with spaces', () => {
    expect(buildBulkRtuPictureFileName('2320 Main St', 'RTU-06 Hybrid', 3, 'jpg')).toBe(
      '2320-RTU-06 Hybrid (3).jpg',
    )
  })

  it('keeps spacing for RTU-04 Hybrid', () => {
    expect(buildBulkRtuPictureFileName('2320 Bristol Circle', 'RTU-04 Hybrid', 1, 'jpg')).toBe(
      '2320-RTU-04 Hybrid (1).jpg',
    )
  })

  it('uses only the portfolio name before a slash', () => {
    expect(
      buildBulkRtuPictureFileName(
        '2320 Bristol Circle',
        'RTU-04 Hybrid/Dual Fuel Heat Pump',
        1,
        'jpg',
      ),
    ).toBe('2320-RTU-04 Hybrid (1).jpg')
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
