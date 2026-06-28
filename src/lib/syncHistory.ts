import { fetchRemoteJson } from '@/lib/jsonDataUrls'
import { buildSummaryDeltas } from '@/lib/portfolioStats'
import { describeSyncSource, formatSyncTimestamp } from '@/lib/syncMeta'
import type {
  SyncHistory,
  SyncHistoryChange,
  SyncHistoryEntry,
  SyncMetaSummary,
} from '@/types/syncMeta'
import bundledSyncHistory from '../../supabase/data/sync-history.json'

export const SYNC_HISTORY_FILE = 'sync-history.json'
const LOCAL_SYNC_HISTORY_KEY = 'bme-sync-history'

function entryKey(entry: Pick<SyncHistoryEntry, 'exportedAt' | 'syncedAt'>): string {
  return `${entry.exportedAt}|${entry.syncedAt}`
}

function normalizeHistory(raw: unknown): SyncHistory {
  if (!raw || typeof raw !== 'object') return { version: 1, entries: [] }
  const parsed = raw as Partial<SyncHistory>
  return {
    version: parsed.version ?? 1,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  }
}

export function loadLocalSyncHistory(): SyncHistory {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_HISTORY_KEY)
    if (!raw) return { version: 1, entries: [] }
    return normalizeHistory(JSON.parse(raw))
  } catch {
    return { version: 1, entries: [] }
  }
}

function saveLocalSyncHistory(history: SyncHistory): void {
  localStorage.setItem(LOCAL_SYNC_HISTORY_KEY, JSON.stringify(history))
}

/** Merge sync histories; later sources win on duplicate exportedAt+syncedAt keys. */
export function mergeSyncHistories(
  ...sources: (SyncHistory | null | undefined)[]
): SyncHistory {
  const byKey = new Map<string, SyncHistoryEntry>()
  for (const source of sources) {
    for (const entry of source?.entries ?? []) {
      byKey.set(entryKey(entry), entry)
    }
  }
  const entries = [...byKey.values()].sort((a, b) => a.syncedAt.localeCompare(b.syncedAt))
  return { version: 1, entries }
}

/** Remote Cloudflare JSON + git-bundled snapshot + this browser's recorded syncs. */
export async function fetchSyncHistory(): Promise<SyncHistory | null> {
  const remote = await fetchRemoteJson<SyncHistory>(SYNC_HISTORY_FILE)
  const local = loadLocalSyncHistory()
  const bundled = normalizeHistory(bundledSyncHistory)
  const merged = mergeSyncHistories(bundled, remote, local)
  return merged.entries.length ? merged : null
}

/** @deprecated Use fetchSyncHistory — kept for existing imports. */
export async function fetchRemoteSyncHistory(): Promise<SyncHistory | null> {
  return fetchSyncHistory()
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
  const chunkCount = after.pictureChunkCount ?? 0
  if (chunkCount > 0) {
    changes.push({
      label: 'Picture upload batches',
      before: before?.pictureChunkCount ?? 0,
      after: chunkCount,
      delta: chunkCount - (before?.pictureChunkCount ?? 0),
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

/** Record a Settings sync on this browser (shown in sync status Excel immediately). */
export function recordLocalSyncHistoryEntry(entry: {
  exportedAt: string
  syncedAt?: string
  source?: string
  summary: SyncMetaSummary
}): SyncHistory {
  const history = loadLocalSyncHistory()
  const updated = appendSyncHistoryEntry(history, {
    exportedAt: entry.exportedAt,
    syncedAt: entry.syncedAt ?? new Date().toISOString(),
    source: entry.source ?? 'settings-sync',
    summary: entry.summary,
  })
  saveLocalSyncHistory(updated)
  return updated
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
