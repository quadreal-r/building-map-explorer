import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isValidStoredPortfolio,
  isPortfolioDirtyLocally,
  loadPortfolioData,
  localPortfolioAheadOfRemote,
  type PortfolioData,
} from '@/hooks/usePortfolioData'
import { portfolioSyncFingerprint } from '@/lib/deploySyncSnapshot'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const samplePortfolio = {
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
    },
  ],
  utilities: [],
  polygons: [],
}

function portfolioWithRtu(description: string): PortfolioData {
  return {
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
        rtus: [{ name: 'RTU-01', description, lat: 43.61, lng: -79.41 }],
      },
    ],
    utilities: [],
    polygons: [],
  }
}

describe('localPortfolioAheadOfRemote', () => {
  it('detects RTU description edits not yet on the remote snapshot', () => {
    const local = portfolioWithRtu('Updated make and model')
    const remote = portfolioWithRtu('Original notes')
    expect(localPortfolioAheadOfRemote(local, remote)).toBe(true)
  })

  it('returns false when RTU text matches the remote snapshot', () => {
    const local = portfolioWithRtu('Same text')
    const remote = portfolioWithRtu('Same text')
    expect(localPortfolioAheadOfRemote(local, remote)).toBe(false)
  })
})

describe('isValidStoredPortfolio', () => {
  it('accepts a well-formed portfolio', () => {
    expect(isValidStoredPortfolio(samplePortfolio)).toBe(true)
  })

  it('rejects missing buildings', () => {
    expect(isValidStoredPortfolio({ utilities: [], polygons: [] })).toBe(false)
  })

  it('rejects empty buildings', () => {
    expect(isValidStoredPortfolio({ buildings: [], utilities: [], polygons: [] })).toBe(false)
  })

  it('rejects buildings without coordinates', () => {
    expect(
      isValidStoredPortfolio({
        buildings: [{ address: '1 Main St' }],
        utilities: [],
        polygons: [],
      }),
    ).toBe(false)
  })
})

describe('loadPortfolioData', () => {
  afterEach(() => {
    localStorage.clear()
    delete window.__BME_EMBEDDED_PORTFOLIO__
  })

  it('prefers embedded portfolio from saved HTML', async () => {
    window.__BME_EMBEDDED_PORTFOLIO__ = samplePortfolio
    await expect(loadPortfolioData()).resolves.toEqual(samplePortfolio)
  })

  it('prefers remote when local matches sync baseline', async () => {
    vi.stubEnv('VITE_JSON_DATA_BASE_URL', 'https://cdn.example.com/data/')
    const local = portfolioWithRtu('Same text')
    const remote = portfolioWithRtu('Cloud newer text')
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(local))
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      portfolioFingerprint: portfolioSyncFingerprint(local),
    })

    const legacyBuildings = remote.buildings.map((building) => ({
      park: building.park,
      address: building.address,
      bu: building.bu,
      lat: building.lat,
      lng: building.lng,
      sqft: building.sqft,
      cluster: building.cluster,
      manager: building.manager,
      rtus: (building.rtus ?? []).map((rtu) => ({
        name: rtu.name,
        desc: rtu.description,
        lat: rtu.lat,
        lng: rtu.lng,
      })),
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = url.split('/').pop()
        const payload =
          path === 'buildings.json'
            ? legacyBuildings
            : path === 'utilities.json'
              ? remote.utilities
              : remote.polygons
        return { ok: true, json: async () => payload }
      }),
    )

    const loaded = await loadPortfolioData()
    expect(loaded.buildings[0]?.rtus?.[0]?.description).toBe('Cloud newer text')
    expect(isPortfolioDirtyLocally()).toBe(false)

    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
})
