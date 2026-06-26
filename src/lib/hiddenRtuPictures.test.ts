import { describe, expect, it, beforeEach } from 'vitest'
import {
  hideRtuManifestPicture,
  isRtuManifestPictureHidden,
} from '@/lib/hiddenRtuPictures'

describe('hiddenRtuPictures', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hides and checks manifest picture keys', () => {
    const key = '2320 Bristol Circle|RTU-04 Hybrid'
    const fileName = '2320-RTU-04HYBRID (1).jpg'
    expect(isRtuManifestPictureHidden(key, fileName)).toBe(false)
    hideRtuManifestPicture(key, fileName)
    expect(isRtuManifestPictureHidden(key, fileName)).toBe(true)
  })
})
