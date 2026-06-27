/**
 * Build Excel rows for sync history tab (Node scripts).
 */
const SOURCE_LABELS = {
  'settings-sync': 'Settings sync on another computer',
  'git-push': 'GitHub deploy',
}

function formatSyncTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function describeSyncSource(source) {
  return SOURCE_LABELS[source] ?? 'Cloudflare upload'
}

function formatDelta(delta) {
  if (delta > 0) return `+${delta}`
  return delta
}

export function buildSyncHistorySheetRows(history) {
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

  const rows = []
  for (const entry of [...history.entries].reverse()) {
    const syncedAt = formatSyncTimestamp(entry.syncedAt)
    const exportedAt = formatSyncTimestamp(entry.exportedAt)
    const source = describeSyncSource(entry.source)
    const changes = entry.changes ?? []
    if (!changes.length) {
      rows.push([syncedAt, exportedAt, source, '(no count changes)', '', '', ''])
      continue
    }
    for (const change of changes) {
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
