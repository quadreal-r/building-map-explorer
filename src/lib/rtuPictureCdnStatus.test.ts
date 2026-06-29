import { describe, expect, it } from 'vitest'
import { buildPictureCdnRows } from '@/lib/rtuPictureCdnStatus'

describe('buildPictureCdnRows', () => {
  it('marks manifest entries missing from CDN', () => {
    const manifest = {
      entries: {
        '2320 Bristol Circle|RTU-02': ['2320-RTU-02-3.jpg'],
      },
    }
    const cdnStatus = new Map<string, boolean>([['2320-RTU-02-3.jpg', false]])
    const rows = buildPictureCdnRows(manifest, cdnStatus)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.cdnStatus).toBe('Missing from CDN')
    expect(rows[0]!.cloudFileName).toBe('2320-RTU-02-3.jpg')
  })

  it('accepts CDN hit on cloud filename alias', () => {
    const manifest = {
      entries: {
        '100 Main|RTU-01': ['RTU-01 (1).jpg'],
      },
    }
    const cdnStatus = new Map<string, boolean>([['100-RTU-01-1.jpg', true]])
    const rows = buildPictureCdnRows(manifest, cdnStatus)
    expect(rows[0]!.cdnStatus).toBe('On CDN')
  })
})
