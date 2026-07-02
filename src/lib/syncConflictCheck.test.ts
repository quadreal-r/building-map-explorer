import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordLocalSyncPush } from '@/lib/remoteSyncState'
import { buildSyncConflictMessage, getSyncConflictWarning } from '@/lib/syncConflictCheck'

vi.mock('@/lib/syncMeta', () => ({
  fetchRemoteSyncMeta: vi.fn(),
}))

import { fetchRemoteSyncMeta } from '@/lib/syncMeta'

describe('syncConflictCheck', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(fetchRemoteSyncMeta).mockReset()
  })

  it('returns null when cloud is not newer than last push', async () => {
    recordLocalSyncPush('2026-07-02T12:00:00.000Z')
    vi.mocked(fetchRemoteSyncMeta).mockResolvedValue({
      exportedAt: '2026-07-01T12:00:00.000Z',
      summary: { buildingCount: 1 },
    } as never)

    expect(await getSyncConflictWarning()).toBeNull()
  })

  it('warns when cloud sync is newer than this PC last push', async () => {
    recordLocalSyncPush('2026-07-01T12:00:00.000Z')
    vi.mocked(fetchRemoteSyncMeta).mockResolvedValue({
      exportedAt: '2026-07-02T12:00:00.000Z',
      summary: { buildingCount: 1 },
    } as never)

    const conflict = await getSyncConflictWarning()
    expect(conflict).toEqual({
      remoteExportedAt: '2026-07-02T12:00:00.000Z',
      lastPushedExportedAt: '2026-07-01T12:00:00.000Z',
    })
    expect(buildSyncConflictMessage(conflict!)).toContain('newer sync')
  })

  it('returns null before this PC has pushed once', async () => {
    vi.mocked(fetchRemoteSyncMeta).mockResolvedValue({
      exportedAt: '2026-07-02T12:00:00.000Z',
      summary: { buildingCount: 1 },
    } as never)

    expect(await getSyncConflictWarning()).toBeNull()
  })
})
