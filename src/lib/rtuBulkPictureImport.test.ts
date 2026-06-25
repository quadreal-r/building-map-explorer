import { describe, expect, it } from 'vitest'
import type { Building } from '@/types/domain'
import {
  buildRtuCatalog,
  extractRtuUnitId,
  findRtuCandidates,
  isExcludedOldRtuPicture,
  formatBulkRtuPictureImportReport,
  parseBulkRtuPictureFileName,
  pickRtuMatch,
} from './rtuBulkPictureImport'

describe('parseBulkRtuPictureFileName', () => {
  it('parses dashed index format', () => {
    expect(parseBulkRtuPictureFileName('150-RT-01-1.jpg')).toEqual({
      buildingNum: '150',
      rtuToken: 'RT-01',
      unitId: '01',
      pictureIndex: 1,
    })
  })

  it('parses RTU with parentheses index', () => {
    expect(parseBulkRtuPictureFileName('150-RTU-02 (3).png')).toEqual({
      buildingNum: '150',
      rtuToken: 'RTU-02',
      unitId: '02',
      pictureIndex: 3,
    })
  })

  it('parses building-RTU-unit without picture index', () => {
    expect(parseBulkRtuPictureFileName('20-RTU-03.jpg')).toEqual({
      buildingNum: '20',
      rtuToken: 'RTU-03',
      unitId: '03',
      pictureIndex: 1,
    })
  })

  it('parses install year suffix', () => {
    expect(parseBulkRtuPictureFileName('20-RTU-01-2015.jpg')).toEqual({
      buildingNum: '20',
      rtuToken: 'RTU-01',
      unitId: '01',
      pictureIndex: 1,
      installYear: 2015,
    })
    expect(parseBulkRtuPictureFileName('20-RTU-01-1 (2015).jpg')).toEqual({
      buildingNum: '20',
      rtuToken: 'RTU-01',
      unitId: '01',
      pictureIndex: 1,
      installYear: 2015,
    })
  })

  it('parses alphanumeric unit ids', () => {
    expect(parseBulkRtuPictureFileName('150-RT-3W-1.jpeg')).toEqual({
      buildingNum: '150',
      rtuToken: 'RT-3W',
      unitId: '3W',
      pictureIndex: 1,
    })
  })

  it('parses full street numbers', () => {
    expect(parseBulkRtuPictureFileName('1590-RTU-04-2.jpg')).toEqual({
      buildingNum: '1590',
      rtuToken: 'RTU-04',
      unitId: '04',
      pictureIndex: 2,
    })
  })
})

describe('RTU bulk matching', () => {
  const buildings: Building[] = [
    {
      park: 'Test',
      address: '1590 South Gateway Road',
      bu: '1',
      lat: 43.63,
      lng: -79.61,
      sqft: '1',
      cluster: '',
      manager: '',
      rtus: [
        { name: 'RTU- 04', description: '', lat: 43.634099, lng: -79.6119392 },
        { name: 'RTU- 02', description: '', lat: 43.6339361, lng: -79.6119565 },
      ],
    },
  ]

  it('matches catalog entries by street number and unit', () => {
    const catalog = buildRtuCatalog(buildings)
    const parsed = parseBulkRtuPictureFileName('1590-RTU-04-1.jpg')!
    const candidates = findRtuCandidates(catalog, parsed)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.rtu.name).toBe('RTU- 04')
  })

  it('accepts GPS within 100 feet', () => {
    const catalog = buildRtuCatalog(buildings)
    const parsed = parseBulkRtuPictureFileName('1590-RTU-04-1.jpg')!
    const candidates = findRtuCandidates(catalog, parsed)
    const { entry } = pickRtuMatch(candidates, { lat: 43.634099, lng: -79.6119392 })
    expect(entry?.rtu.name).toBe('RTU- 04')
  })

  it('still matches but warns when GPS is beyond 100 feet', () => {
    const catalog = buildRtuCatalog(buildings)
    const parsed = parseBulkRtuPictureFileName('1590-RTU-04-1.jpg')!
    const candidates = findRtuCandidates(catalog, parsed)
    const { entry, gpsWarning } = pickRtuMatch(candidates, { lat: 43.64, lng: -79.62 })
    expect(entry?.rtu.name).toBe('RTU- 04')
    expect(gpsWarning).toMatch(/GPS is \d+ ft/)
  })

  it('normalizes RT and RTU unit ids', () => {
    expect(extractRtuUnitId('RT-04')).toBe('04')
    expect(extractRtuUnitId('RTU- 04')).toBe('04')
    expect(extractRtuUnitId('RTU-01A')).toBe('01A')
  })
})

describe('formatBulkRtuPictureImportReport', () => {
  it('formats a full upload report', () => {
    const report = formatBulkRtuPictureImportReport({
      totalFiles: 3,
      excluded: [{ file: 'old/photo.jpg', reason: 'Excluded (path or filename contains "old")' }],
      imported: 1,
      skipped: 1,
      successes: [
        {
          file: '1590-RTU-04-1.jpg',
          buildingAddress: '1590 South Gateway Road',
          rtuName: 'RTU- 04',
          pictureIndex: 1,
          storedFileName: '1590_RTU-04_(1).jpg',
        },
      ],
      failures: [{ file: 'bad.jpg', reason: 'Filename does not match bulk RTU pattern' }],
      warnings: [{ file: '1590-RTU-04-1.jpg', message: 'Linked by filename only (no GPS in photo)' }],
      completedAt: '2026-06-23T12:00:00.000Z',
    })

    expect(report).toContain('RTU Picture Bulk Import Report')
    expect(report).toContain('Imported: 1')
    expect(report).toContain('1590-RTU-04-1.jpg')
    expect(report).toContain('1590_RTU-04_(1).jpg')
    expect(report).toContain('Excluded (path or filename contains "old")')
  })
})

describe('isExcludedOldRtuPicture', () => {
  function mockFile(name: string, webkitRelativePath?: string): File {
    const file = new File([''], name, { type: 'image/jpeg' })
    if (webkitRelativePath) {
      Object.defineProperty(file, 'webkitRelativePath', { value: webkitRelativePath })
    }
    return file
  }

  it('excludes files in folders with old in the name', () => {
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-1.jpg', 'old/1590-RTU-04-1.jpg'))).toBe(true)
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-1.jpg', 'archive-old/1590-RTU-04-1.jpg'))).toBe(
      true,
    )
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-1.jpg', 'buildings/Old RTUs/1590-RTU-04-1.jpg'))).toBe(
      true,
    )
  })

  it('excludes filenames containing old', () => {
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-old.jpg'))).toBe(true)
    expect(isExcludedOldRtuPicture(mockFile('old-1590-RTU-04-1.jpg'))).toBe(true)
  })

  it('includes normal paths and filenames', () => {
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-1.jpg', '1590/1590-RTU-04-1.jpg'))).toBe(false)
    expect(isExcludedOldRtuPicture(mockFile('1590-RTU-04-1.jpg'))).toBe(false)
  })
})
