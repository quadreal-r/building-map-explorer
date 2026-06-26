import { beforeEach, describe, expect, it } from 'vitest'
import { formatUnsyncedChangesMessage } from '@/lib/unsyncedChanges'

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
})
