import { describe, expect, it } from 'vitest'

describe('syncStatusReport', () => {
  it('module loads', async () => {
    const mod = await import('@/lib/syncStatusReport')
    expect(typeof mod.downloadSyncStatusExcel).toBe('function')
  })
})
