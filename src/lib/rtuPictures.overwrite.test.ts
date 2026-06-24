import { describe, expect, it } from 'vitest'
import { parseRtuPictureIndex } from './rtuPictures'

describe('RTU picture overwrite by index', () => {
  it('parses picture index from stored filenames', () => {
    expect(parseRtuPictureIndex('1590_RTU-04_(1).jpg')).toBe(1)
    expect(parseRtuPictureIndex('1590_RTU-04_(2).png')).toBe(2)
  })

  it('treats same index with different extensions as the same slot', () => {
    const indexA = parseRtuPictureIndex('1590_RTU-04_(1).jpg')
    const indexB = parseRtuPictureIndex('1590_RTU-04_(1).png')
    expect(indexA).toBe(indexB)
  })
})
