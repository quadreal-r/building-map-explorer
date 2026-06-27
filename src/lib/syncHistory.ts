import { fetchRemoteJson } from '@/lib/jsonDataUrls'
import { buildSummaryDeltas } from '@/lib/portfolioStats'
import { describeSyncSource, formatSyncTimestamp } from '@/lib/syncMeta'
import type {
  SyncHistory,
  SyncHistoryChange,
  SyncHistoryEntry,
  SyncMetaSummary,
} from '@/types/syncMeta'

export const SYNC_HISTORY_FILE = 'sync-history.json'

export async function fetchRemoteSyncHistory(): Promise<SyncHistory | null> {
  const history = await fetchRemoteJson<SyncHistory>(SYNC_HISTORY_FILE)
  if (!history?.entries?.length) return null
  return history
}

/** Changes since the prior sync snapshot, plus per-sync picture uploads. */
export function buildSyncHistoryChanges(
  before: SyncMetaSummary | null | undefined,
  after: SyncMetaSummary,
  picturesUploaded = 0,
): SyncHistoryChange[] {
  const changes = before ? buildSummaryDeltas(before, after) : []
  if (picturesUploaded > 0) {
    changes.push({
      label: 'Pictures uploaded (this sync)',
      before: 0,
      after: picturesUploaded,
      delta: picturesUploaded,
    })
  }
  return changes
}

export function appendSyncHistoryEntry(
  history: SyncHistory,
  entry: Omit<SyncHistoryEntry, 'changes'> & { summary: SyncMetaSummary },
): SyncHistory {
  const last = history.entries[history.entries.length - 1]
  if (last?.exportedAt === entry.exportedAt && last?.syncedAt === entry.syncedAt) {
    return history
  }
  const changes = buildSyncHistoryChanges(
    last?.summary,
    entry.summary,
    entry.summary.picturesUploaded ?? 0,
  )
  return {
    version: history.version ?? 1,
    entries: [
      ...history.entries,
      {
        syncedAt: entry.syncedAt,
        exportedAt: entry.exportedAt,
        source: entry.source,
        summary: entry.summary,
        changes,
      },
    ],
  }
}

function formatDelta(delta: number): string | number {
  if (delta > 0) return `+${delta}`
  return delta
}

/** Rows for Excel "Sync history" sheet (newest syncs first). */
export function buildSyncHistorySheetRows(
  history: SyncHistory | null,
): (string | number)[][] {
  const header = [
    'Synced at',
    'Exported at',
    'Source',
    'Change',
    'Before',
    'After',
    'Delta',
  ]

  if (!history?.entries?.length) {
    return [header, ['(no sync history recorded yet)', '', '', '', '', '', '']]
  }

  const rows: (string | number)[][] = []
  for (const entry of [...history.entries].reverse()) {
    const syncedAt = formatSyncTimestamp(entry.syncedAt)
    const exportedAt = formatSyncTimestamp(entry.exportedAt)
    const source = describeSyncSource(entry.source)
    if (!entry.changes.length) {
      rows.push([syncedAt, exportedAt, source, '(no count changes)', '', '', ''])
      continue
    }
    for (const change of entry.changes) {
      rows.push([
        syncedAt,
        exportedAt,
        source,
        change.label,
        change.before,
        change.after,
        formatDelta(change.delta),
      ])
    }
  }

  return [header, ...rows]
}
