import { describe, expect, it } from 'vitest'
import { bundleFileName, serializeDeployBundle } from '@/lib/deployBundle'
import type { DeployBundle } from '@/types/deployBundle'

const minimalBundle: DeployBundle = {
  version: 1,
  exportedAt: '2026-06-24T12:00:00.000Z',
  portfolio: {
    buildings: [
      {
        park: 'P',
        address: '1 Main St',
        bu: '1',
        lat: 43.6,
        lng: -79.4,
        sqft: '1',
        cluster: 'C',
        manager: 'M',
      },
    ],
    utilities: [],
    polygons: [],
  },
  schedule: { replacementYears: {}, notes: {} },
  pricing: { version: 'v1', rows: [] },
  pictures: [],
}

describe('serializeDeployBundle', () => {
  it('serializes a minimal bundle', () => {
    const { json, picturesOmitted } = serializeDeployBundle(minimalBundle)
    expect(picturesOmitted).toBe(false)
    expect(JSON.parse(json).portfolio.buildings).toHaveLength(1)
  })

  it('names files with export date', () => {
    expect(bundleFileName(minimalBundle)).toBe('deploy-bundle-2026-06-24.json')
  })
})
