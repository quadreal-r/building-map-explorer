import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectUnsyncedChangesSummary, formatUnsyncedChangesMessage } from '@/lib/unsyncedChanges'
import * as syncState from '@/lib/syncState'

describe('unsyncedChanges', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('formats change lines for display', () => {
    const message = formatUnsyncedChangesMessage([
      { id: 'portfolio', label: 'Portfolio edits' },
      { id: 'pending-pictures', label: 'RTU pictures waiting to upload', count: 3 },
    ])
    expect(message).toBe(
      'Portfolio edits; RTU pictures waiting to upload (3)',
    )
  })

  it('returns empty string when there are no changes', () => {
    expect(formatUnsyncedChangesMessage([])).toBe('')
  })

  it('delegates summary collection to syncState', async () => {
    const lines = [{ id: 'portfolio', label: 'Portfolio edits' }]
    vi.spyOn(syncState, 'collectUnsyncedLines').mockResolvedValue(lines)
    await expect(collectUnsyncedChangesSummary()).resolves.toEqual(lines)
  })
})
