import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isRtuPictureReachableOnCdn,
  isRtuPictureReachableOnCdnWithRetry,
} from '@/lib/rtuPictureReachability'
import { verifyRtuPicturesOnCdn } from '@/lib/rtuPictureCdnStatus'

describe('isRtuPictureReachableOnCdn', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falls back to image load when HEAD is blocked', async () => {
    vi.stubEnv('VITE_RTU_PICTURES_BASE_URL', 'https://cdn.example.com/')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    vi.stubGlobal(
      'Image',
      class MockImage {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )

    await expect(isRtuPictureReachableOnCdn('100-RTU-01 (1).jpg')).resolves.toBe(true)
  })
})

describe('isRtuPictureReachableOnCdnWithRetry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retries after initial CDN miss', async () => {
    vi.stubEnv('VITE_RTU_PICTURES_BASE_URL', 'https://cdn.example.com/')
    let attempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        attempts += 1
        return { ok: attempts >= 2 }
      }),
    )

    await expect(
      isRtuPictureReachableOnCdnWithRetry('missing.json', [1]),
    ).resolves.toBe(true)
    expect(attempts).toBe(2)
  })
})

describe('verifyRtuPicturesOnCdn', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('marks files reachable via image load', async () => {
    vi.stubEnv('VITE_RTU_PICTURES_BASE_URL', 'https://cdn.example.com/')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    vi.stubGlobal(
      'Image',
      class MockImage {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )

    const status = await verifyRtuPicturesOnCdn(['100-RTU-01 (1).jpg'])
    expect(status.get('100-RTU-01 (1).jpg')).toBe(true)
  })
})
