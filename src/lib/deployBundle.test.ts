import { afterEach, describe, expect, it } from 'vitest'
import { collectDeployBundleLean } from '@/lib/deployBundle'
import { bundleFileName, serializeDeployBundle } from '@/lib/deployBundle'
import type { DeployBundle } from '@/types/deployBundle'
import type { PortfolioData } from '@/types/domain'

const PORTFOLIO_KEY = 'bme-portfolio'

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

describe('collectDeployBundleLean', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('includes RTU description edits from localStorage in the deploy bundle', () => {
    const staleFallback: PortfolioData = {
      buildings: [
        {
          address: '1 Main St',
          lat: 43.6,
          lng: -79.4,
          park: 'P',
          bu: '1',
          sqft: '1',
          cluster: 'C',
          manager: 'M',
          rtus: [{ name: 'RTU-01', description: 'Old text', lat: 43.61, lng: -79.41 }],
        },
      ],
      utilities: [],
      polygons: [],
    }
    const stored: PortfolioData = {
      ...staleFallback,
      buildings: [
        {
          ...staleFallback.buildings[0]!,
          rtus: [{ name: 'RTU-01', description: 'Edited in popup', lat: 43.61, lng: -79.41 }],
        },
      ],
    }
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(stored))

    const bundle = collectDeployBundleLean(staleFallback)
    expect(bundle.portfolio.buildings[0]?.rtus?.[0]?.description).toBe('Edited in popup')
  })
})

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
