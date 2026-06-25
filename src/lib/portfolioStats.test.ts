import { describe, expect, it } from 'vitest'
import { buildSummaryDeltas, countPortfolioStats } from '@/lib/portfolioStats'
import type { PortfolioData } from '@/types/domain'
import type { SyncMetaSummary } from '@/types/syncMeta'

const portfolio: PortfolioData = {
  buildings: [
    {
      park: 'P',
      address: '1 Main',
      bu: '',
      lat: 1,
      lng: 2,
      sqft: '',
      cluster: '',
      manager: '',
      rtus: [{ name: 'RTU-1', description: '', lat: 1, lng: 2 }],
    },
  ],
  utilities: [{ id: 1, utility_type: 'Fire Hydrants', name: 'H1', description: '', lat: 1, lng: 2 }],
  polygons: [],
}

describe('portfolioStats', () => {
  it('counts portfolio markers', () => {
    expect(countPortfolioStats(portfolio)).toEqual({
      buildingCount: 1,
      rtuCount: 1,
      utilityCount: 1,
      polygonCount: 0,
    })
  })

  it('builds summary deltas', () => {
    const local: SyncMetaSummary = {
      buildingCount: 1,
      rtuCount: 1,
      utilityCount: 1,
      polygonCount: 0,
      manifestPictureCount: 10,
      picturesUploaded: 0,
      scheduleYearCount: 2,
      scheduleNoteCount: 1,
      pricingRowCount: 5,
    }
    const remote: SyncMetaSummary = {
      ...local,
      rtuCount: 3,
      utilityCount: 2,
      manifestPictureCount: 12,
    }
    const deltas = buildSummaryDeltas(local, remote)
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'RTU markers', before: 1, after: 3, delta: 2 }),
        expect.objectContaining({ label: 'Utility markers', before: 1, after: 2, delta: 1 }),
      ]),
    )
  })
})
