import { describe, expect, it } from 'vitest'
import {
  buildingStreetNumber,
  parseRtuPictureIndex,
  rtuPictureFileBase,
  rtuPictureFileName,
  rtuPictureKey,
  sanitizeRtuFileToken,
} from './rtuPictures'

describe('rtuPictures naming', () => {
  it('extracts building street number', () => {
    expect(buildingStreetNumber('1590 South Gateway Rd.')).toBe('1590')
  })

  it('sanitizes RTU name for filenames', () => {
    expect(sanitizeRtuFileToken('RTU- 04')).toBe('RTU-04')
  })

  it('builds stable RTU picture keys', () => {
    expect(rtuPictureKey('1590 South Gateway Rd.', 'RTU- 04')).toBe('1590 South Gateway Rd.|RTU- 04')
  })

  it('builds file base and numbered filenames', () => {
    expect(rtuPictureFileBase('1590 South Gateway Rd.', 'RTU- 04')).toBe('1590_RTU-04')
    expect(rtuPictureFileName('1590 South Gateway Rd.', 'RTU- 04', 1, 'jpg')).toBe('1590_RTU-04_(1).jpg')
    expect(rtuPictureFileName('1590 South Gateway Rd.', 'RTU- 04', 2, 'png')).toBe('1590_RTU-04_(2).png')
  })

  it('parses index from filename', () => {
    expect(parseRtuPictureIndex('1590_RTU-04_(3).jpg')).toBe(3)
    expect(parseRtuPictureIndex('100-RTU-01-1.jpg')).toBe(1)
    expect(parseRtuPictureIndex('20-RTU-01-1 (2015).jpg')).toBe(1)
    expect(parseRtuPictureIndex('6325-RTU-1 (2).JPG')).toBe(2)
    expect(parseRtuPictureIndex('1590-RTU-04-2.jpg')).toBe(2)
  })
})
