import { describe, expect, it } from 'vitest'
import { buildPictureCountSummary } from '@/lib/rtuPictureCountSummary'
import { rtuPictureKey } from '@/lib/rtuPictures'
import type { Building } from '@/types/domain'

const buildings: Building[] = [
  {
    address: '100 Test Road',
    park: 'Test Park',
    bu: '',
    lat: 0,
    lng: 0,
    sqft: '',
    cluster: '',
    manager: '',
    rtus: [{ name: 'RTU-1', description: '', lat: 0, lng: 0 }],
  },
  {
    address: '200 Test Road',
    park: 'Test Park',
    bu: '',
    lat: 0,
    lng: 0,
    sqft: '',
    cluster: '',
    manager: '',
    rtus: [
      { name: 'RTU-1', description: '', lat: 0, lng: 0 },
      { name: 'RTU-2', description: '', lat: 0, lng: 0 },
    ],
  },
]

describe('buildPictureCountSummary', () => {
  it('aggregates counts by park and building', () => {
    const counts = new Map<string, number>([
      [rtuPictureKey('100 Test Road', 'RTU-1'), 2],
      [rtuPictureKey('200 Test Road', 'RTU-1'), 1],
    ])

    const summary = buildPictureCountSummary(buildings, counts)

    expect(summary.totalPictures).toBe(3)
    expect(summary.rtusWithPictures).toBe(2)
    expect(summary.rtusTotal).toBe(3)
    expect(summary.parkPictureTotals.get('Test Park')).toBe(3)
    expect(summary.buildingPictureTotals.get('100 Test Road')).toBe(2)
    expect(summary.rtusMissingPictures).toHaveLength(1)
    expect(summary.rtusMissingPictures[0]?.rtuName).toBe('RTU-2')
  })
})
