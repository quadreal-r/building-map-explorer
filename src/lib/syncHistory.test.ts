import { describe, expect, it } from 'vitest'
import {
  appendSyncHistoryEntry,
  buildSyncHistoryChanges,
  buildSyncHistorySheetRows,
} from '@/lib/syncHistory'
import type { SyncHistory, SyncMetaSummary } from '@/types/syncMeta'

const baseSummary: SyncMetaSummary = {
  buildingCount: 100,
  rtuCount: 1000,
  utilityCount: 250,
  polygonCount: 440,
  manifestPictureCount: 1600,
  picturesUploaded: 0,
  scheduleYearCount: 460,
  scheduleNoteCount: 340,
  pricingRowCount: 25,
}

describe('syncHistory', () => {
  it('records summary deltas between syncs', () => {
    const after: SyncMetaSummary = {
      ...baseSummary,
      rtuCount: 1002,
      manifestPictureCount: 1603,
      picturesUploaded: 3,
      pictureChunkCount: 2,
    }
    const changes = buildSyncHistoryChanges(baseSummary, after, 3)
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'RTU markers', delta: 2 }),
        expect.objectContaining({ label: 'RTU pictures (manifest)', delta: 3 }),
        expect.objectContaining({ label: 'Pictures uploaded (this sync)', delta: 3 }),
        expect.objectContaining({ label: 'Picture upload batches', after: 2, delta: 2 }),
      ]),
    )
  })

  it('appends history entries without duplicates', () => {
    const history: SyncHistory = { version: 1, entries: [] }
    const first = appendSyncHistoryEntry(history, {
      syncedAt: '2026-06-27T10:00:00.000Z',
      exportedAt: '2026-06-27T09:59:00.000Z',
      source: 'settings-sync',
      summary: baseSummary,
    })
    expect(first.entries).toHaveLength(1)

    const dup = appendSyncHistoryEntry(first, {
      syncedAt: '2026-06-27T10:00:00.000Z',
      exportedAt: '2026-06-27T09:59:00.000Z',
      source: 'settings-sync',
      summary: baseSummary,
    })
    expect(dup.entries).toHaveLength(1)

    const second = appendSyncHistoryEntry(dup, {
      syncedAt: '2026-06-27T11:00:00.000Z',
      exportedAt: '2026-06-27T10:59:00.000Z',
      source: 'settings-sync',
      summary: { ...baseSummary, rtuCount: 1001 },
    })
    expect(second.entries).toHaveLength(2)
    expect(second.entries[1]?.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'RTU markers', delta: 1 })]),
    )
  })

  it('builds Excel rows newest first', () => {
    const history: SyncHistory = {
      version: 1,
      entries: [
        {
          syncedAt: '2026-06-27T10:00:00.000Z',
          exportedAt: '2026-06-27T09:59:00.000Z',
          source: 'settings-sync',
          summary: baseSummary,
          changes: [],
        },
        {
          syncedAt: '2026-06-27T11:00:00.000Z',
          exportedAt: '2026-06-27T10:59:00.000Z',
          source: 'git-push',
          summary: { ...baseSummary, rtuCount: 1001 },
          changes: [{ label: 'RTU markers', before: 1000, after: 1001, delta: 1 }],
        },
      ],
    }
    const rows = buildSyncHistorySheetRows(history)
    expect(rows[1]?.[0]).toBeTruthy()
    expect(rows[1]?.[2]).toContain('GitHub')
    expect(rows[1]?.[3]).toBe('RTU markers')
  })
})
