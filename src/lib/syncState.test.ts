import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  portfolioSyncFingerprint,
  pricingSyncFingerprint,
  scheduleSyncFingerprint,
} from '@/lib/deploySyncSnapshot'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import {
  collectUnsyncedLines,
  isDeployDataDirty,
  isPortfolioDirty,
  isPricingDirty,
  isScheduleDirty,
  markSchedulePricingDirty,
  recordSyncBaseline,
  syncLegacyDirtyFlags,
} from '@/lib/syncState'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import type { PortfolioData } from '@/types/domain'

vi.mock('@/lib/rtuPictures', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    reconcilePendingDeployWithCloud: vi.fn().mockResolvedValue(undefined),
    countPendingPicturesNeedingCloudUpload: vi.fn().mockResolvedValue(0),
  }
})

const portfolio = (): PortfolioData => ({
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

describe('syncState portfolio dirty', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('uses legacy flag before first sync baseline', () => {
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(portfolio()))
    localStorage.setItem(STORAGE_KEYS.portfolioUnsaved, '1')
    expect(isPortfolioDirty()).toBe(true)
  })

  it('detects portfolio edits via fingerprint after baseline', () => {
    const data = portfolio()
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(data))
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      portfolioFingerprint: portfolioSyncFingerprint(data),
    })

    const edited = portfolio()
    edited.buildings[0]!.manager = 'Bob'
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(edited))

    expect(isPortfolioDirty()).toBe(true)
  })

  it('clears stale portfolio flag when fingerprint matches baseline', () => {
    const data = portfolio()
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(data))
    localStorage.setItem(STORAGE_KEYS.portfolioUnsaved, '1')
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      portfolioFingerprint: portfolioSyncFingerprint(data),
    })

    syncLegacyDirtyFlags()
    expect(isPortfolioDirty()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.portfolioUnsaved)).toBeNull()
  })
})

describe('syncState schedule and pricing dirty', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detects schedule edits after baseline', () => {
    localStorage.setItem(STORAGE_KEYS.rtuSchedule, JSON.stringify(schedule))
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      scheduleFingerprint: scheduleSyncFingerprint(schedule),
    })

    const edited = {
      ...schedule,
      replacementYears: { '1 Main St|RTU-01': '2028' },
    }
    localStorage.setItem(STORAGE_KEYS.rtuSchedule, JSON.stringify(edited))

    expect(isScheduleDirty()).toBe(true)
    expect(isDeployDataDirty()).toBe(true)
    expect(isPricingDirty()).toBe(false)
  })

  it('clears pre-baseline dirty state after baseline matches', async () => {
    const emptySchedule = { replacementYears: {}, notes: {} }
    localStorage.setItem(STORAGE_KEYS.rtuPricing, JSON.stringify(pricing))
    localStorage.setItem(STORAGE_KEYS.rtuSchedule, JSON.stringify(emptySchedule))
    markSchedulePricingDirty()

    await recordSyncBaseline(portfolio(), {
      exportedAt: '2026-07-01T12:00:00.000Z',
      pricingFingerprint: pricingSyncFingerprint(pricing),
      scheduleFingerprint: scheduleSyncFingerprint(emptySchedule),
    })

    syncLegacyDirtyFlags()
    expect(isPricingDirty()).toBe(false)
    expect(isScheduleDirty()).toBe(false)
    expect(isDeployDataDirty()).toBe(false)
  })
})

describe('syncState collectUnsyncedLines', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('includes portfolio line when fingerprint differs from baseline', async () => {
    const data = portfolio()
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(data))
    recordLocalSyncPush('2026-07-01T12:00:00.000Z', {
      portfolioFingerprint: portfolioSyncFingerprint(data),
    })

    const edited = portfolio()
    edited.buildings[0]!.manager = 'Bob'
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(edited))

    const lines = await collectUnsyncedLines()
    expect(lines.some((line) => line.id === 'portfolio')).toBe(true)
  })
})

describe('recordSyncBaseline', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records fingerprints and clears legacy flags', async () => {
    const data = portfolio()
    localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(data))
    localStorage.setItem(STORAGE_KEYS.portfolioUnsaved, '1')

    const recorded = await recordSyncBaseline(data, {
      exportedAt: '2026-07-02T12:00:00.000Z',
      hiddenKeys: [],
    })

    expect(recorded).toBe(true)
    expect(isPortfolioDirty(data)).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.portfolioUnsaved)).toBeNull()
  })
})
