import { describe, expect, it, beforeEach } from 'vitest'
import {
  acknowledgeRemoteSync,
  loadRemoteSyncState,
  recordLocalSyncPush,
  shouldPromptForRemoteSync,
} from '@/lib/remoteSyncState'

describe('remoteSyncState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not prompt before initialization', () => {
    expect(
      shouldPromptForRemoteSync('2026-06-25T12:00:00.000Z', {
        acknowledgedExportedAt: null,
        lastPushedExportedAt: null,
        initialized: false,
      }),
    ).toBe(false)
  })

  it('does not prompt for your own push', () => {
    recordLocalSyncPush('2026-06-25T12:00:00.000Z')
    expect(shouldPromptForRemoteSync('2026-06-25T12:00:00.000Z')).toBe(false)
  })

  it('prompts when remote is newer than acknowledged', () => {
    acknowledgeRemoteSync('2026-06-25T10:00:00.000Z')
    expect(shouldPromptForRemoteSync('2026-06-25T12:00:00.000Z')).toBe(true)
  })

  it('does not prompt after acknowledge', () => {
    acknowledgeRemoteSync('2026-06-25T12:00:00.000Z')
    expect(shouldPromptForRemoteSync('2026-06-25T12:00:00.000Z')).toBe(false)
  })

  it('persists push and acknowledge timestamps', () => {
    recordLocalSyncPush('2026-06-25T12:00:00.000Z')
    const state = loadRemoteSyncState()
    expect(state.lastPushedExportedAt).toBe('2026-06-25T12:00:00.000Z')
    expect(state.acknowledgedExportedAt).toBe('2026-06-25T12:00:00.000Z')
    expect(state.initialized).toBe(true)
  })
})
