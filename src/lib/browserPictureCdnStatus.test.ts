import { describe, expect, it, vi } from 'vitest'
import {
  buildBrowserPictureCdnStatus,
  countManifestPictures,
} from '@/lib/browserPictureCdnStatus'
import type { SyncMeta } from '@/types/syncMeta'

const manifest = {
  entries: {
    '100 Leek Crescent|RTU- 01': [
      '100-RTU-01 (1) (Audit-2024).jpg',
      '100-RTU-01 (2) (Audit-2024).jpg',
    ],
  },
}

describe('buildBrowserPictureCdnStatus', () => {
  it('trusts sync-meta when manifest counts match', async () => {
    const cloudMeta = {
      version: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      syncedAt: '2026-06-30T00:00:00.000Z',
      source: 'settings-sync',
      summary: {
        buildingCount: 1,
        rtuCount: 1,
        utilityCount: 0,
        polygonCount: 0,
        scheduleYearCount: 0,
        scheduleNoteCount: 0,
        pricingRowCount: 0,
        manifestPictureCount: 2,
        picturesUploaded: 0,
      },
    } satisfies SyncMeta

    const { statusByFile, verificationNote } = await buildBrowserPictureCdnStatus(
      manifest,
      cloudMeta,
    )

    expect(countManifestPictures(manifest)).toBe(2)
    expect(statusByFile.get('100-RTU-01 (1) (Audit-2024).jpg')).toBe(true)
    expect(verificationNote).toContain('sync-meta')
  })

  it('uses a small sample when sync-meta is unavailable', async () => {
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

    const { statusByFile, verificationNote } = await buildBrowserPictureCdnStatus(manifest, null)

    expect(statusByFile.get('100-RTU-01 (1) (Audit-2024).jpg')).toBe(true)
    expect(verificationNote).toContain('Sample CDN check')

    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
