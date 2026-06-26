import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  hideRtuManifestPicture,
  isRtuManifestPictureHidden,
  loadBundledHiddenRtuPictures,
} from '@/lib/hiddenRtuPictures'

describe('hiddenRtuPictures', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('hides and checks manifest picture keys', () => {
    const key = '2320 Bristol Circle|RTU-04 Hybrid'
    const fileName = '2320-RTU-04HYBRID (1).jpg'
    expect(isRtuManifestPictureHidden(key, fileName)).toBe(false)
    hideRtuManifestPicture(key, fileName)
    expect(isRtuManifestPictureHidden(key, fileName)).toBe(true)
  })

  it('merges bundled hidden.json with local hides', async () => {
    const key = '2320 Bristol Circle|RTU-03'
    const fileName = '2320-RTU-03-1.jpg'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [`${key}|${fileName}`],
      }),
    )
    await loadBundledHiddenRtuPictures()
    expect(isRtuManifestPictureHidden(key, fileName)).toBe(true)
  })
})
