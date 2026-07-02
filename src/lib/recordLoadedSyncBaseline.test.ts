import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  pricingSyncFingerprint,
  scheduleSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import { loadRemoteSyncState } from '@/lib/remoteSyncState'
import { recordLoadedSyncBaseline } from '@/lib/recordLoadedSyncBaseline'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import type { PortfolioData } from '@/types/domain'

vi.mock('@/lib/syncMeta', () => ({
  fetchRemoteSyncMeta: vi.fn(async () => ({
    exportedAt: '2026-07-02T12:00:00.000Z',
    summary: { buildingCount: 1 },
  })),
}))

const portfolio: PortfolioData = {
  buildings: [
    {
      park: 'P',
      address: '1 Main',
      bu: '1',
      lat: 43.6,
      lng: -79.4,
      sqft: '1000',
      cluster: 'C',
      manager: 'Alice',
    },
  ],
  utilities: [],
  polygons: [],
}

const schedule = {
  replacementYears: { '1 Main|RTU-01': '2030' },
  notes: {},
  sourceFile: null,
}

const pricing = {
  version: 'V1',
  sourceFile: null,
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

describe('recordLoadedSyncBaseline', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.rtuSchedule, JSON.stringify(schedule))
    localStorage.setItem(STORAGE_KEYS.rtuPricing, JSON.stringify(pricing))
  })

  it('records fingerprints from loaded local data and clears deploy dirty state', async () => {
    localStorage.setItem(STORAGE_KEYS.deployUnsaved, '1')

    const recorded = await recordLoadedSyncBaseline(portfolio, { hiddenKeys: [] })
    expect(recorded).toBe(true)

    const state = loadRemoteSyncState()
    expect(state.lastPushedExportedAt).toBe('2026-07-02T12:00:00.000Z')
    expect(state.lastPushedScheduleFingerprint).toBe(scheduleSyncFingerprint(schedule))
    expect(state.lastPushedPricingFingerprint).toBe(pricingSyncFingerprint(pricing))
    expect(localStorage.getItem(STORAGE_KEYS.deployUnsaved)).toBeNull()
  })
})
