import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearDeployDataDirty,
  isDeployDataDirtyLocally,
  isDeployPricingDirtyLocally,
  isDeployScheduleDirtyLocally,
  localPortfolioDiffersFromRemote,
  markDeployDataDirty,
  portfolioSyncFingerprint,
  pricingSyncFingerprint,
  scheduleSyncFingerprint,
  syncDeployDirtyFlag,
} from '@/lib/deploySyncSnapshot'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import type { PortfolioData } from '@/types/domain'

const basePortfolio = (): PortfolioData => ({
  buildings: [
    {
      address: '1 Main St',
      lat: 43.6,
      lng: -79.4,
      park: 'P',
      bu: '1',
      sqft: '1000',
      cluster: 'C',
      manager: 'Alice',
      rtus: [{ name: 'RTU-01', description: 'Model: X', lat: 43.61, lng: -79.41 }],
    },
  ],
  utilities: [],
  polygons: [],
})

describe('portfolioSyncFingerprint', () => {
  it('detects Excel-style building field changes', () => {
    const local = basePortfolio()
    const remote = basePortfolio()
    remote.buildings[0]!.manager = 'Bob'
    expect(localPortfolioDiffersFromRemote(local, remote)).toBe(true)
  })

  it('detects RTU description edits from Excel or popup text changes', () => {
    const local = basePortfolio()
    const remote = basePortfolio()
    remote.buildings[0]!.rtus![0]!.description = 'Original'
    local.buildings[0]!.rtus![0]!.description = 'Model: Updated'
    expect(localPortfolioDiffersFromRemote(local, remote)).toBe(true)
  })

  it('detects removed buildings from a full database import', () => {
    const local = basePortfolio()
    const remote: PortfolioData = {
      ...local,
      buildings: [
        ...local.buildings,
        {
          address: '2 Other St',
          lat: 43.7,
          lng: -79.5,
          park: 'P',
          bu: '2',
          sqft: '500',
          cluster: 'C',
          manager: 'Alice',
        },
      ],
    }
    expect(localPortfolioDiffersFromRemote(local, remote)).toBe(true)
  })

  it('returns false for identical sync snapshots', () => {
    const local = basePortfolio()
    const remote = basePortfolio()
    expect(portfolioSyncFingerprint(local)).toBe(portfolioSyncFingerprint(remote))
    expect(localPortfolioDiffersFromRemote(local, remote)).toBe(false)
  })
})

describe('scheduleSyncFingerprint', () => {
  it('detects replacement year changes from capital workbook import', () => {
    const local = scheduleSyncFingerprint({
      replacementYears: { '1 Main St|RTU-01': '2030' },
      notes: {},
    })
    const remote = scheduleSyncFingerprint({
      replacementYears: { '1 Main St|RTU-01': '2028' },
      notes: {},
    })
    expect(local).not.toBe(remote)
  })
})

describe('deploy dirty detection', () => {
  const scheduleKey = 'bme-rtu-schedule'
  const pricingKey = 'bme-rtu-pricing'

  const schedule = {
    replacementYears: { '1 Main St|RTU-01': '2030' },
    notes: {},
    sourceFile: 'equipment.xlsx',
  }

  const pricing = {
    version: 'V2026_5_1_4',
    sourceFile: 'pricing.xlsx',
    rows: [
      {
        tonnageKey: 2,
        label: '2 Ton',
        notes: '',
        model: 'Test',
        supplyStd: 1000,
        supplyHyb: 1100,
        install: 8000,
        consulting: 0,
        structural: 1500,
        serviceBalancing: 0,
        electrical: 1000,
        miscellaneous: 0,
        supervisoryMult: 1.05,
      },
    ],
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('treats stale dirty flags as clean after a successful sync fingerprint baseline', () => {
    localStorage.setItem(scheduleKey, JSON.stringify(schedule))
    localStorage.setItem(pricingKey, JSON.stringify(pricing))
    markDeployDataDirty()

    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      scheduleFingerprint: scheduleSyncFingerprint(schedule),
      pricingFingerprint: pricingSyncFingerprint(pricing),
    })

    expect(isDeployScheduleDirtyLocally()).toBe(false)
    expect(isDeployPricingDirtyLocally()).toBe(false)
    expect(isDeployDataDirtyLocally()).toBe(false)
    syncDeployDirtyFlag()
    expect(localStorage.getItem('bme-deploy-unsaved')).toBeNull()
  })

  it('detects real pricing edits after sync', () => {
    localStorage.setItem(pricingKey, JSON.stringify(pricing))
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      pricingFingerprint: pricingSyncFingerprint(pricing),
    })

    const edited = {
      ...pricing,
      rows: [{ ...pricing.rows[0]!, supplyStd: 2000 }],
    }
    localStorage.setItem(pricingKey, JSON.stringify(edited))

    expect(isDeployPricingDirtyLocally()).toBe(true)
    expect(isDeployScheduleDirtyLocally()).toBe(false)
  })

  it('keeps legacy dirty flag behavior before the first sync baseline exists', () => {
    localStorage.setItem(pricingKey, JSON.stringify(pricing))
    markDeployDataDirty()
    expect(isDeployPricingDirtyLocally()).toBe(true)
    clearDeployDataDirty()
    expect(isDeployPricingDirtyLocally()).toBe(false)
  })
})
